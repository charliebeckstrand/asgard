import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, errorResponse, HTTPException, jsonRequest, jsonResponse } from 'grid'
import { createTrip, listTrips, MAX_TRIPS, removeTrip, updateTrip } from '../handlers/trips.js'
import {
	CreatedTripSchema,
	NewTripSchema,
	TripDraftSchema,
	TripListSchema,
	TripSchema,
} from '../lib/schemas.js'
import { requireRole, requireUser, type UserEnv } from '../middleware/user.js'

const params = z.object({ id: z.string().min(1).openapi({ description: 'The id of the trip' }) })

const listTripsRoute = createRoute({
	method: 'get',
	path: '/trips',
	tags: ['Trips'],
	summary: 'List your trips',
	description: 'Newest `startsOn` first.',
	responses: {
		200: jsonResponse(TripListSchema, 'Trips'),
		401: errorResponse('Not signed in'),
	},
})

const createTripRoute = createRoute({
	method: 'post',
	path: '/trips',
	tags: ['Trips'],
	summary: 'Add a trip',
	description:
		'Adds the trip and records each stop on it, in one change. Every stop must fall in the trip’s days: 400 `visit-outside-trip` otherwise.',
	middleware: [requireRole('user')] as const,
	request: {
		body: jsonRequest(NewTripSchema),
	},
	responses: {
		201: jsonResponse(CreatedTripSchema, 'Trip added'),
		400: errorResponse(
			'Invalid trip, a stop outside its days (`visit-outside-trip`), a stop naming no place of yours, or another user’s photo (`photo-not-yours`)',
		),
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
		409: errorResponse(
			`Already keeping ${MAX_TRIPS} trips, or as many places or visits as allowed`,
		),
	},
})

const updateTripRoute = createRoute({
	method: 'put',
	path: '/trips/{id}',
	tags: ['Trips'],
	summary: 'Replace a trip',
	description: 'Keeps its id, when it was added, and its visits.',
	middleware: [requireRole('user')] as const,
	request: {
		params,
		body: jsonRequest(TripDraftSchema),
	},
	responses: {
		200: jsonResponse(TripSchema, 'Trip replaced'),
		400: errorResponse('Invalid trip, or another user’s photo (`photo-not-yours`)'),
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
		404: errorResponse('No trip with that id'),
		409: errorResponse(
			'The new days would leave out one of its visits (`trip-days-exclude-visits`)',
		),
	},
})

const removeTripRoute = createRoute({
	method: 'delete',
	path: '/trips/{id}',
	tags: ['Trips'],
	summary: 'Remove a trip',
	description: 'Its visits stay on their places, without the trip. Its photos are deleted.',
	middleware: [requireRole('user')] as const,
	request: {
		params,
	},
	responses: {
		204: { description: 'Trip removed' },
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
		404: errorResponse('No trip with that id'),
	},
})

const tripsRoutes = createRouter<UserEnv>()

tripsRoutes.openapi(listTripsRoute, async (c) => {
	return c.json(await listTrips(requireUser(c).id), 200)
})

tripsRoutes.openapi(createTripRoute, async (c) => {
	return c.json(await createTrip(requireUser(c).id, c.req.valid('json')), 201)
})

tripsRoutes.openapi(updateTripRoute, async (c) => {
	const { id } = c.req.valid('param')

	const trip = await updateTrip(requireUser(c).id, id, c.req.valid('json'))

	if (!trip) throw new HTTPException(404, { message: 'No trip with that id' })

	return c.json(trip, 200)
})

tripsRoutes.openapi(removeTripRoute, async (c) => {
	const { id } = c.req.valid('param')

	if (!(await removeTrip(requireUser(c).id, id))) {
		throw new HTTPException(404, { message: 'No trip with that id' })
	}

	return c.body(null, 204)
})

export { tripsRoutes }
