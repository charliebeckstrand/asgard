import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { errorResponse, jsonRequest, jsonResponse, validationHook } from 'grid'
import {
	confirmTotp,
	deleteTotp,
	generateRecoveryCodes,
	getFactors,
	requireRecentSignIn,
	secondFactorMethods,
	startTotpSetup,
} from '../auth/index.js'
import { requireSession, type SessionEnv } from '../middleware/session.js'

// A user manages only their own second factors. Passkeys have their own routes
// under `/auth/passkeys`.

const FactorsSchema = z
	.object({
		enabled: z.boolean().openapi({ description: 'Whether sign-in takes a second step' }),
		passkeys: z.number().int(),
		totp: z.boolean().openapi({ description: 'Whether an authenticator app is on' }),
		recovery_codes: z.number().int().openapi({ description: 'Unused recovery codes' }),
	})
	.openapi('Factors')

const TotpSetupSchema = z
	.object({
		secret: z.string().openapi({ description: 'The secret, base32, for typing into an app' }),
		uri: z.string().openapi({ description: 'The `otpauth://` URI, for a QR code' }),
	})
	.openapi('TotpSetup')

const TotpConfirmSchema = z
	.object({ code: z.string().max(16).openapi({ description: 'A code the app shows now' }) })
	.openapi('TotpConfirm')

const RecoveryCodesSchema = z
	.object({ codes: z.array(z.string()).openapi({ description: 'Shown this once' }) })
	.openapi('RecoveryCodes')

const getFactorsRoute = createRoute({
	method: 'get',
	path: '/',
	tags: ['MFA'],
	summary: 'Show your second factors',
	responses: {
		200: jsonResponse(FactorsSchema, 'Your second factors'),
		401: errorResponse('Not authenticated'),
	},
})

const totpSetupRoute = createRoute({
	method: 'post',
	path: '/totp/setup',
	tags: ['MFA'],
	summary: 'Start adding an authenticator app',
	description:
		'Needs a sign-in from the last ten minutes. The app stays off until `POST /totp` confirms a code; a new setup replaces an unconfirmed one.',
	responses: {
		200: jsonResponse(TotpSetupSchema, 'Secret for the app'),
		401: errorResponse('Not authenticated'),
		403: errorResponse('Sign in again'),
		409: errorResponse('An authenticator app is already on'),
		503: errorResponse('Authenticator apps are not set up on this server'),
	},
})

const totpConfirmRoute = createRoute({
	method: 'post',
	path: '/totp',
	tags: ['MFA'],
	summary: 'Turn on the authenticator app',
	description: 'Needs a sign-in from the last ten minutes, and a code from the app.',
	request: {
		body: jsonRequest(TotpConfirmSchema),
	},
	responses: {
		204: { description: 'Authenticator app on' },
		400: errorResponse('Code not correct'),
		401: errorResponse('Not authenticated'),
		403: errorResponse('Sign in again'),
		404: errorResponse('No setup to confirm'),
	},
})

const totpDeleteRoute = createRoute({
	method: 'delete',
	path: '/totp',
	tags: ['MFA'],
	summary: 'Remove the authenticator app',
	description:
		'Needs a sign-in from the last ten minutes. An admin keeps a passkey or an authenticator app.',
	responses: {
		204: { description: 'Authenticator app removed' },
		401: errorResponse('Not authenticated'),
		403: errorResponse('Sign in again'),
		404: errorResponse('No authenticator app'),
		409: errorResponse('Last second factor of an admin'),
	},
})

const recoveryCodesRoute = createRoute({
	method: 'post',
	path: '/recovery-codes',
	tags: ['MFA'],
	summary: 'Make new recovery codes',
	description:
		'Needs a sign-in from the last ten minutes and a second factor. Replaces any earlier codes.',
	responses: {
		200: jsonResponse(RecoveryCodesSchema, 'New recovery codes'),
		401: errorResponse('Not authenticated'),
		403: errorResponse('Sign in again'),
		409: errorResponse('No second factor'),
	},
})

const mfaRoutes = new OpenAPIHono<SessionEnv>({ defaultHook: validationHook })

// Answers 401 before a body is validated.
mfaRoutes.use('*', async (c, next) => {
	requireSession(c)

	return next()
})

mfaRoutes.openapi(getFactorsRoute, async (c) => {
	const { user } = requireSession(c)

	const factors = await getFactors(user.id)

	c.header('Cache-Control', 'private, no-store')

	return c.json({ enabled: secondFactorMethods(factors).length > 0, ...factors }, 200)
})

mfaRoutes.openapi(totpSetupRoute, async (c) => {
	const session = requireSession(c)

	requireRecentSignIn(session)

	c.header('Cache-Control', 'private, no-store')

	return c.json(await startTotpSetup(session.user), 200)
})

mfaRoutes.openapi(totpConfirmRoute, async (c) => {
	const session = requireSession(c)

	requireRecentSignIn(session)

	await confirmTotp(session.user.id, c.req.valid('json').code)

	return c.body(null, 204)
})

mfaRoutes.openapi(totpDeleteRoute, async (c) => {
	const session = requireSession(c)

	requireRecentSignIn(session)

	await deleteTotp(session.user.id)

	return c.body(null, 204)
})

mfaRoutes.openapi(recoveryCodesRoute, async (c) => {
	const session = requireSession(c)

	requireRecentSignIn(session)

	c.header('Cache-Control', 'private, no-store')

	return c.json({ codes: await generateRecoveryCodes(session.user.id) }, 200)
})

export { mfaRoutes }
