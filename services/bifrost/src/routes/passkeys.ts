import { createRoute, z } from '@hono/zod-openapi'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { createRouter, errorResponse, jsonRequest, jsonResponse } from 'grid'
import { createListSchema, PasskeySchema, toList } from 'skuld'
import {
	createRegistrationOptions,
	deletePasskey,
	getPasskeys,
	passSecondStep,
	registerPasskey,
} from '../auth/index.js'
import { authorizeSignInChange, requireSession, type SessionEnv } from '../middleware/session.js'
import { recordChange } from './activity.js'

// A user manages only their own passkeys; no one else can add or remove them.

// WebAuthn JSON, which @simplewebauthn builds and checks. OpenAPI cannot name its
// types, so these schemas leave the spec open (`unknown`), and each client takes
// the types of its WebAuthn library.

export const PasskeyOptionsSchema = z
	.unknown()
	.openapi('PasskeyOptions', { description: 'WebAuthn options, as the browser API expects them' })

const CredentialShape = z.looseObject({
	id: z.string(),
	rawId: z.string(),
	type: z.literal('public-key'),
	response: z.record(z.string(), z.unknown()),
	clientExtensionResults: z.record(z.string(), z.unknown()),
})

// A malformed credential still gets a 400 before @simplewebauthn reads it.
export const PasskeyCredentialSchema = z
	.unknown()
	.refine((value) => CredentialShape.safeParse(value).success, 'Not a WebAuthn credential')
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

const passkeysRoutes = createRouter<SessionEnv>()

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
	const session = await authorizeSignInChange(c)

	return c.json(await createRegistrationOptions(session.user), 200)
})

passkeysRoutes.openapi(addPasskeyRoute, async (c) => {
	const session = await authorizeSignInChange(c)

	const credential = c.req.valid('json') as RegistrationResponseJSON

	const passkey = await registerPasskey(session.user.id, credential)

	// A first factor has no second step to pass, so adding it is one.
	await passSecondStep(session.id)

	await recordChange(c, session.user.id, 'passkey_added', 'A passkey was added to your account')

	return c.json(passkey, 201)
})

passkeysRoutes.openapi(deletePasskeyRoute, async (c) => {
	const session = await authorizeSignInChange(c)

	await deletePasskey(session.user.id, c.req.valid('param').id)

	await recordChange(
		c,
		session.user.id,
		'passkey_removed',
		'A passkey was removed from your account',
	)

	return c.body(null, 204)
})

export { passkeysRoutes }
