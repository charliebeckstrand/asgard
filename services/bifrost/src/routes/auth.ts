import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { errorResponse, HTTPException, jsonRequest, jsonResponse, validationHook } from 'grid'
import { getIpAddress } from 'grid/middleware'
import type { Context } from 'hono'
import {
	EmailSchema,
	LoginPasswordSchema,
	MessageSchema,
	PasswordSchema,
	SessionSchema,
	UserSchema,
} from 'skuld'
import {
	AuthError,
	authenticatePasskey,
	authenticateUser,
	createSecondFactorOptions,
	createSession,
	createSignInOptions,
	deleteSession,
	deleteUserSessions,
	registerUser,
	type SecondFactorProof,
	verifySession,
} from '../auth/index.js'
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
	})
	.openapi('RegisterRequest')

const RegisterResponseSchema = UserSchema.pick({ id: true, email: true }).openapi(
	'RegisterResponse',
)

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
		'Checks a passkey, authenticator code or recovery code of the signed-in user and marks the session as past its second step. The fifth wrong try ends the session.',
	request: {
		body: jsonRequest(SecondFactorRequestSchema),
	},
	responses: {
		200: jsonResponse(SessionSchema, 'Session verified'),
		400: errorResponse('Code or passkey not accepted, or no second factor'),
		401: errorResponse('Not authenticated'),
		410: errorResponse('Too many tries; the session ended'),
	},
})

const registerRoute = createRoute({
	method: 'post',
	path: '/register',
	tags: ['Auth'],
	summary: 'Register a new account',
	description: 'Creates a new user account.',
	request: {
		body: jsonRequest(RegisterRequestSchema),
	},
	responses: {
		201: jsonResponse(RegisterResponseSchema, 'Account created'),
		400: errorResponse('Validation error'),
		409: errorResponse('Email already registered'),
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

export const authRoutes = new OpenAPIHono<SessionEnv>({ defaultHook: validationHook })
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
	.openapi(registerRoute, async (c) => {
		const { email, password } = c.req.valid('json')

		const user = await registerUser(email, password, getIpAddress(c))

		return c.json({ id: user.id, email: user.email }, 201)
	})
