import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { errorResponse, jsonRequest, jsonResponse, validationHook } from 'grid'
import { createListSchema, PasskeySchema, toList } from 'skuld'
import {
	createRegistrationOptions,
	deletePasskey,
	getPasskeys,
	registerPasskey,
	requireRecentSignIn,
} from '../auth/index.js'
import { requireSession, type SessionEnv } from '../middleware/session.js'

// A user manages only their own passkeys; no one else can add or remove them.

export const PasskeyOptionsSchema = z
	.record(z.string(), z.unknown())
	.openapi('PasskeyOptions', { description: 'WebAuthn options, as the browser API expects them' })

export const PasskeyCredentialSchema = z
	.looseObject({
		id: z.string(),
		rawId: z.string(),
		type: z.literal('public-key'),
		response: z.record(z.string(), z.unknown()),
		clientExtensionResults: z.record(z.string(), z.unknown()),
	})
	.openapi('PasskeyCredential', { description: 'The credential the browser API returned' })

const PasskeyListSchema = createListSchema(PasskeySchema, 'PasskeyList')

const listPasskeysRoute = createRoute({
	method: 'get',
	path: '/',
	tags: ['Passkeys'],
	summary: 'List your passkeys',
	responses: {
		200: jsonResponse(PasskeyListSchema, 'Your passkeys'),
		401: errorResponse('Not authenticated'),
	},
})

const registrationOptionsRoute = createRoute({
	method: 'post',
	path: '/options',
	tags: ['Passkeys'],
	summary: 'Start adding a passkey',
	description: 'Needs a sign-in from the last ten minutes.',
	responses: {
		200: jsonResponse(PasskeyOptionsSchema, 'Registration options'),
		401: errorResponse('Not authenticated'),
		403: errorResponse('Sign in again'),
	},
})

const addPasskeyRoute = createRoute({
	method: 'post',
	path: '/',
	tags: ['Passkeys'],
	summary: 'Add a passkey',
	description: 'Verifies the new passkey against the challenge from `/options`.',
	request: {
		body: jsonRequest(PasskeyCredentialSchema),
	},
	responses: {
		201: jsonResponse(PasskeySchema, 'Passkey added'),
		400: errorResponse('Passkey could not be verified'),
		401: errorResponse('Not authenticated'),
		403: errorResponse('Sign in again'),
	},
})

const deletePasskeyRoute = createRoute({
	method: 'delete',
	path: '/{id}',
	tags: ['Passkeys'],
	summary: 'Remove a passkey',
	description: 'Needs a sign-in from the last ten minutes. An admin keeps at least one.',
	request: {
		params: z.object({ id: z.string() }),
	},
	responses: {
		204: { description: 'Passkey removed' },
		401: errorResponse('Not authenticated'),
		403: errorResponse('Sign in again'),
		404: errorResponse('Passkey not found'),
		409: errorResponse('Last passkey of an admin'),
	},
})

const passkeysRoutes = new OpenAPIHono<SessionEnv>({ defaultHook: validationHook })

// Answers 401 before a body is validated.
passkeysRoutes.use('*', async (c, next) => {
	requireSession(c)

	return next()
})

passkeysRoutes.openapi(listPasskeysRoute, async (c) => {
	const { user } = requireSession(c)

	return c.json(toList(await getPasskeys(user.id)), 200)
})

passkeysRoutes.openapi(registrationOptionsRoute, async (c) => {
	const session = requireSession(c)

	requireRecentSignIn(session)

	return c.json(await createRegistrationOptions(session.user), 200)
})

passkeysRoutes.openapi(addPasskeyRoute, async (c) => {
	const session = requireSession(c)

	requireRecentSignIn(session)

	const credential = c.req.valid('json') as unknown as RegistrationResponseJSON

	return c.json(await registerPasskey(session.user.id, credential), 201)
})

passkeysRoutes.openapi(deletePasskeyRoute, async (c) => {
	const session = requireSession(c)

	requireRecentSignIn(session)

	await deletePasskey(session.user.id, c.req.valid('param').id)

	return c.body(null, 204)
})

export { passkeysRoutes }
