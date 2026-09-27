import { createRoute, z } from '@hono/zod-openapi'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { createRouter, errorResponse, HTTPException, jsonRequest, jsonResponse } from 'grid'
import { getIpAddress } from 'grid/middleware'
import type { Context } from 'hono'
import {
	EmailSchema,
	LoginPasswordSchema,
	MessageSchema,
	PasswordSchema,
	SessionSchema,
} from 'skuld'
import {
	AuthError,
	authenticatePasskey,
	authenticateUser,
	checkTurnstile,
	createSecondFactorOptions,
	createSession,
	createSignInOptions,
	deleteSession,
	deleteUserSessions,
	registerUser,
	requestPasswordReset,
	resetPassword,
	type SecondFactorProof,
	sendAccountExistsEmail,
	sendVerificationEmail,
	turnstileSiteKey,
	verifyEmail,
	verifySession,
} from '../auth/index.js'
import { appOrigin } from '../lib/app-origin.js'
import { logger } from '../lib/log.js'
import {
	clearSessionCookie,
	getSessionToken,
	requireSession,
	type SessionEnv,
	setSessionCookie,
} from '../middleware/session.js'
import { PasskeyCredentialSchema, PasskeyOptionsSchema } from './passkeys.js'

const LoginRequestSchema = z
	.object({
		email: EmailSchema,
		password: LoginPasswordSchema,
	})
	.openapi('LoginRequest')

const RegisterRequestSchema = z
	.object({
		email: EmailSchema,
		password: PasswordSchema,
		name: z.string().min(1).optional(),
		turnstile_token: z
			.string()
			.max(2048)
			.optional()
			.openapi({ description: 'The token of the Turnstile widget, when sign-up has one' }),
	})
	.openapi('RegisterRequest')

const RegisterOptionsSchema = z
	.object({
		turnstile_site_key: z.string().nullable().openapi({
			description: 'The key to show Turnstile with, or null when sign-up has no check',
		}),
	})
	.openapi('RegisterOptions')

const TokenSchema = z.string().max(64).openapi({ description: 'The token from the emailed link' })

const VerifyEmailRequestSchema = z.object({ token: TokenSchema }).openapi('VerifyEmailRequest')

const ResetPasswordRequestSchema = z.object({ email: EmailSchema }).openapi('ResetPasswordRequest')

const NewPasswordRequestSchema = z
	.object({ token: TokenSchema, password: PasswordSchema })
	.openapi('NewPasswordRequest')

const SecondFactorRequestSchema = z
	.union([
		z.object({
			totp: z.string().max(16).openapi({ description: 'Code from the authenticator app' }),
		}),
		z.object({
			recovery_code: z.string().max(64).openapi({ description: 'An unused recovery code' }),
		}),
		z.object({ passkey: PasskeyCredentialSchema }),
	])
	.openapi('SecondFactorRequest')

const loginRoute = createRoute({
	method: 'post',
	path: '/login',
	tags: ['Auth'],
	summary: 'Login with email and password',
	description:
		'Authenticates credentials, starts a one-step session and sets its cookie. A session the browser still holds is replaced. `/session/verify` takes the session past its second step.',
	request: {
		body: jsonRequest(LoginRequestSchema),
	},
	responses: {
		200: jsonResponse(SessionSchema, 'Login successful'),
		401: errorResponse('Invalid credentials'),
		403: errorResponse('Account inactive'),
		429: errorResponse('Too many wrong passwords for this email; try again in a minute'),
	},
})

const signInOptionsRoute = createRoute({
	method: 'post',
	path: '/login/options',
	tags: ['Auth'],
	summary: 'Start a passkey sign-in',
	responses: {
		200: jsonResponse(PasskeyOptionsSchema, 'Authentication options'),
	},
})

const passkeyLoginRoute = createRoute({
	method: 'post',
	path: '/login/passkey',
	tags: ['Auth'],
	summary: 'Login with a passkey',
	description:
		'Verifies the passkey against the challenge from `/login/options`, then starts a session like `/login`. A passkey is a second step in itself, so the session starts past it.',
	request: {
		body: jsonRequest(PasskeyCredentialSchema),
	},
	responses: {
		200: jsonResponse(SessionSchema, 'Login successful'),
		401: errorResponse('Passkey not recognized'),
		403: errorResponse('Account inactive'),
	},
})

const logoutRoute = createRoute({
	method: 'post',
	path: '/logout',
	tags: ['Auth'],
	summary: 'Logout',
	description: 'Deletes the current session and clears its cookie.',
	responses: {
		200: jsonResponse(MessageSchema, 'Logged out'),
	},
})

const sessionRoute = createRoute({
	method: 'get',
	path: '/session',
	tags: ['Auth'],
	summary: 'Get current session',
	description: 'Returns the current session and its user, or 401.',
	responses: {
		200: jsonResponse(SessionSchema, 'Active session'),
		401: errorResponse('Not authenticated'),
	},
})

const deleteOtherSessionsRoute = createRoute({
	method: 'delete',
	path: '/sessions',
	tags: ['Auth'],
	summary: 'Sign out other devices',
	description: 'Deletes every session of the current user except this one.',
	responses: {
		204: { description: 'Other sessions deleted' },
		401: errorResponse('Not authenticated'),
	},
})

const verifyOptionsRoute = createRoute({
	method: 'post',
	path: '/session/verify/options',
	tags: ['Auth'],
	summary: 'Start a passkey second step',
	description: 'Returns passkey options that name the passkeys of the signed-in user.',
	responses: {
		200: jsonResponse(PasskeyOptionsSchema, 'Authentication options'),
		401: errorResponse('Not authenticated'),
	},
})

const verifyRoute = createRoute({
	method: 'post',
	path: '/session/verify',
	tags: ['Auth'],
	summary: 'Pass the second step',
	description:
		'Checks a passkey, authenticator code or recovery code of the signed-in user and marks the session as past its second step. The fifth wrong try ends the session. Past five wrong tries across all their sessions, a user gets one try every fifteen minutes.',
	request: {
		body: jsonRequest(SecondFactorRequestSchema),
	},
	responses: {
		200: jsonResponse(SessionSchema, 'Session verified'),
		400: errorResponse('Code or passkey not accepted, or no second factor'),
		401: errorResponse('Not authenticated'),
		410: errorResponse('Too many tries; the session ended'),
		429: errorResponse('Too many wrong tries for this user; try again in 15 minutes'),
	},
})

const registerOptionsRoute = createRoute({
	method: 'get',
	path: '/register/options',
	tags: ['Auth'],
	summary: 'Get what the sign-up page needs',
	responses: {
		200: jsonResponse(RegisterOptionsSchema, 'Sign-up options'),
	},
})

const registerRoute = createRoute({
	method: 'post',
	path: '/register',
	tags: ['Auth'],
	summary: 'Register a new account',
	description:
		'Creates an account and emails a link that verifies its address. When the email already has an account, emails its owner instead. Answers the same either way, so no one can learn who has an account.',
	request: {
		body: jsonRequest(RegisterRequestSchema),
	},
	responses: {
		202: jsonResponse(MessageSchema, 'Check your email'),
		400: errorResponse(
			'Validation error, a failed Turnstile check, or a password known from a data breach',
		),
	},
})

const sendVerificationRoute = createRoute({
	method: 'post',
	path: '/verify-email',
	tags: ['Auth'],
	summary: 'Email a verification link',
	description:
		'Emails the signed-in user a link that verifies their address, for 24 hours. A new link replaces the last one, at most once a minute.',
	responses: {
		204: { description: 'Link sent' },
		400: errorResponse('Unknown app origin'),
		401: errorResponse('Not authenticated'),
		409: errorResponse('Email already verified'),
		429: errorResponse('A link was sent less than a minute ago'),
	},
})

const verifyEmailRoute = createRoute({
	method: 'post',
	path: '/verify-email/confirm',
	tags: ['Auth'],
	summary: 'Verify an email',
	description: 'Uses the token of a verification link and marks the email verified.',
	request: {
		body: jsonRequest(VerifyEmailRequestSchema),
	},
	responses: {
		204: { description: 'Email verified' },
		400: errorResponse('Link expired or already used'),
	},
})

const requestPasswordResetRoute = createRoute({
	method: 'post',
	path: '/reset-password',
	tags: ['Auth'],
	summary: 'Email a password reset link',
	description:
		'Emails a link that sets a new password, for one hour, when an active account has the email. Answers the same either way.',
	request: {
		body: jsonRequest(ResetPasswordRequestSchema),
	},
	responses: {
		202: jsonResponse(MessageSchema, 'Link sent if the account exists'),
		400: errorResponse('Unknown app origin'),
	},
})

const resetPasswordRoute = createRoute({
	method: 'post',
	path: '/reset-password/confirm',
	tags: ['Auth'],
	summary: 'Set a new password',
	description:
		'Uses the token of a reset link to set a new password, marks the email verified, and ends every session of the user.',
	request: {
		body: jsonRequest(NewPasswordRequestSchema),
	},
	responses: {
		204: { description: 'Password set' },
		400: errorResponse('Link expired or already used, or a password known from a data breach'),
	},
})

/** Starts a session for `userId`, replacing the one the browser still holds, and sets its cookie. */
async function signIn(c: Context, userId: string, twoStep = false) {
	const { token, session } = await createSession(userId, {
		replacing: getSessionToken(c),
		twoStep,
	})

	setSessionCookie(c, token)

	return session
}

/** The app the request came through, which emailed links open, or a 400. */
function requireAppOrigin(c: Context): string {
	const origin = appOrigin(c)

	if (!origin) {
		throw new HTTPException(400, { message: 'Unknown app origin' })
	}

	return origin
}

export const authRoutes = createRouter<SessionEnv>()
	.openapi(loginRoute, async (c) => {
		const { email, password } = c.req.valid('json')

		const userId = await authenticateUser(email, password, getIpAddress(c))

		return c.json(await signIn(c, userId), 200)
	})
	.openapi(signInOptionsRoute, async (c) => {
		return c.json(await createSignInOptions(), 200)
	})
	.openapi(passkeyLoginRoute, async (c) => {
		const credential = c.req.valid('json') as unknown as AuthenticationResponseJSON

		const userId = await authenticatePasskey(credential, getIpAddress(c))

		return c.json(await signIn(c, userId, true), 200)
	})
	.openapi(logoutRoute, async (c) => {
		const current = c.get('session')

		if (current) {
			await deleteSession(current.id)
		}

		clearSessionCookie(c)

		return c.json({ message: 'Logged out' }, 200)
	})
	.openapi(sessionRoute, async (c) => {
		const current = c.get('session')

		if (!current) {
			throw new HTTPException(401, { message: 'Not authenticated' })
		}

		c.header('Cache-Control', 'private, no-store')

		return c.json(current, 200)
	})
	.openapi(deleteOtherSessionsRoute, async (c) => {
		const current = c.get('session')

		if (!current) {
			throw new HTTPException(401, { message: 'Not authenticated' })
		}

		await deleteUserSessions(current.user.id, current.id)

		return c.body(null, 204)
	})
	.openapi(verifyOptionsRoute, async (c) => {
		const current = requireSession(c)

		return c.json(await createSecondFactorOptions(current.user.id), 200)
	})
	.openapi(verifyRoute, async (c) => {
		const current = requireSession(c)

		const proof = c.req.valid('json') as SecondFactorProof

		try {
			await verifySession(current, proof, getIpAddress(c))
		} catch (err) {
			if (err instanceof AuthError && err.code === 'sign_in_expired') clearSessionCookie(c)

			throw err
		}

		return c.json({ ...current, two_step: true }, 200)
	})
	.openapi(registerOptionsRoute, (c) => c.json({ turnstile_site_key: turnstileSiteKey() }, 200))
	.openapi(registerRoute, async (c) => {
		const { email, password, turnstile_token } = c.req.valid('json')

		const ip = getIpAddress(c)

		await checkTurnstile(turnstile_token, ip)

		const user = await registerUser(email, password, ip)

		const origin = appOrigin(c)

		// Sent in the background, so a mail outage never fails a sign-up and both
		// answers take the same time. The account page can send another link.
		if (origin) {
			const sending = user
				? sendVerificationEmail(user, origin)
				: sendAccountExistsEmail(email, origin)

			sending.catch((err: unknown) => {
				logger().error({ err }, 'failed to send a sign-up email')
			})
		}

		return c.json({ message: 'Check your email to finish signing up' }, 202)
	})
	.openapi(sendVerificationRoute, async (c) => {
		const current = requireSession(c)

		if (current.user.is_verified) {
			throw new AuthError('email_verified', 'Your email is already verified')
		}

		await sendVerificationEmail(current.user, requireAppOrigin(c))

		return c.body(null, 204)
	})
	.openapi(verifyEmailRoute, async (c) => {
		await verifyEmail(c.req.valid('json').token)

		return c.body(null, 204)
	})
	.openapi(requestPasswordResetRoute, async (c) => {
		const origin = requireAppOrigin(c)

		// Runs in the background, so the answer takes as long whether or not the
		// account exists.
		requestPasswordReset(c.req.valid('json').email, origin).catch((err: unknown) => {
			logger().error({ err }, 'failed to send a password reset email')
		})

		return c.json({ message: 'If an account has that email, a link is on its way' }, 202)
	})
	.openapi(resetPasswordRoute, async (c) => {
		const { token, password } = c.req.valid('json')

		await resetPassword(token, password)

		return c.body(null, 204)
	})
