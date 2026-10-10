import { createRoute } from '@hono/zod-openapi'
import { createRouter, errorResponse, jsonResponse } from 'grid'
import { deleteDocuments } from '../handlers/documents.js'
import { listPlaces } from '../handlers/places.js'
import { listAllPicks } from '../handlers/predictions.js'
import { listTrips } from '../handlers/trips.js'
import { listVisits } from '../handlers/visits.js'
import { AccountDataSchema } from '../lib/schemas.js'
import { requireUser, type UserEnv } from '../middleware/user.js'

// Bifrost calls these itself when a user exports or deletes their account. It
// doesn't forward `/api/account`, so no app reaches them.

const getAccountDataRoute = createRoute({
	method: 'get',
	path: '/account',
	tags: ['Account'],
	summary: "Get all of a user's data",
	description: "Every app's data of the user, for their export.",
	responses: {
		200: jsonResponse(AccountDataSchema, "The user's data"),
		401: errorResponse('No user'),
	},
})

const deleteAccountDataRoute = createRoute({
	method: 'delete',
	path: '/account',
	tags: ['Account'],
	summary: "Delete all of a user's data",
	description:
		"Deletes every app's data of the user, when their account is deleted. The daily photo sweep deletes their photos once nothing holds them.",
	responses: {
		204: { description: 'Data deleted' },
		401: errorResponse('No user'),
	},
})

const accountRoutes = createRouter<UserEnv>()

accountRoutes.openapi(getAccountDataRoute, async (c) => {
	const { id } = requireUser(c)

	const [places, visits, trips, predictions] = await Promise.all([
		listPlaces(id),
		listVisits(id),
		listTrips(id),
		listAllPicks(id),
	])

	return c.json({ places, visits, trips, predictions }, 200)
})

accountRoutes.openapi(deleteAccountDataRoute, async (c) => {
	const { id } = requireUser(c)

	await deleteDocuments(id)

	return c.body(null, 204)
})

export { accountRoutes }
