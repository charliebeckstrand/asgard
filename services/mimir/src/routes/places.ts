import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, errorResponse, HTTPException, jsonRequest, jsonResponse } from 'grid'
import { addPlace, listPlaces, MAX_PLACES, removePlace, updatePlace } from '../handlers/places.js'
import { PlaceDraftSchema, PlaceListSchema, PlaceSchema } from '../lib/schemas.js'
import { requireRole, requireUser, type UserEnv } from '../middleware/user.js'

const params = z.object({ id: z.string().min(1).openapi({ description: 'The id of the place' }) })

const listPlacesRoute = createRoute({
	method: 'get',
	path: '/places',
	tags: ['Places'],
	summary: 'List your places',
	description: 'Newest visit first.',
	responses: {
		200: jsonResponse(PlaceListSchema, 'Places'),
		401: errorResponse('Not signed in'),
	},
})

const addPlaceRoute = createRoute({
	method: 'post',
	path: '/places',
	tags: ['Places'],
	summary: 'Add a place',
	middleware: [requireRole('user')] as const,
	request: {
		body: jsonRequest(PlaceDraftSchema),
	},
	responses: {
		201: jsonResponse(PlaceSchema, 'Place added'),
		400: errorResponse(
			'Invalid place, a visit outside its trip (`visit-outside-trip`), or another user’s photo (`photo-not-yours`)',
		),
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
		409: errorResponse(
			`Already keeping ${MAX_PLACES} places, or a photo is no longer available (\`photo-missing\`)`,
		),
	},
})

const updatePlaceRoute = createRoute({
	method: 'put',
	path: '/places/{id}',
	tags: ['Places'],
	summary: 'Replace a place',
	description: 'Keeps its id and when it was added.',
	middleware: [requireRole('user')] as const,
	request: {
		params,
		body: jsonRequest(PlaceDraftSchema),
	},
	responses: {
		200: jsonResponse(PlaceSchema, 'Place replaced'),
		400: errorResponse(
			'Invalid place, a visit outside its trip (`visit-outside-trip`), or another user’s photo (`photo-not-yours`)',
		),
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
		404: errorResponse('No place with that id'),
		409: errorResponse('A photo is no longer available (`photo-missing`)'),
	},
})

const removePlaceRoute = createRoute({
	method: 'delete',
	path: '/places/{id}',
	tags: ['Places'],
	summary: 'Remove a place',
	middleware: [requireRole('user')] as const,
	request: {
		params,
	},
	responses: {
		204: { description: 'Place removed' },
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
		404: errorResponse('No place with that id'),
	},
})

const placesRoutes = createRouter<UserEnv>()

placesRoutes.openapi(listPlacesRoute, async (c) => {
	const { id } = requireUser(c)

	return c.json(await listPlaces(id), 200)
})

placesRoutes.openapi(addPlaceRoute, async (c) => {
	const place = await addPlace(requireUser(c).id, c.req.valid('json'))

	if (!place) {
		throw new HTTPException(409, {
			message: `You can keep up to ${MAX_PLACES.toLocaleString('en-US')} places`,
		})
	}

	return c.json(place, 201)
})

placesRoutes.openapi(updatePlaceRoute, async (c) => {
	const { id } = c.req.valid('param')

	const place = await updatePlace(requireUser(c).id, id, c.req.valid('json'))

	if (!place) throw new HTTPException(404, { message: 'No place with that id' })

	return c.json(place, 200)
})

placesRoutes.openapi(removePlaceRoute, async (c) => {
	const { id } = c.req.valid('param')

	if (!(await removePlace(requireUser(c).id, id))) {
		throw new HTTPException(404, { message: 'No place with that id' })
	}

	return c.body(null, 204)
})

export { placesRoutes }
