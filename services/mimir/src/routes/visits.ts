import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, errorResponse, HTTPException, jsonRequest, jsonResponse } from 'grid'
import { listVisits, MAX_VISITS, setVisit } from '../handlers/visits.js'
import { RegionSchema, SetVisitSchema, VisitScopeSchema, VisitsSchema } from '../lib/schemas.js'
import { requireRole, requireUser, type UserEnv } from '../middleware/user.js'

const listVisitsRoute = createRoute({
	method: 'get',
	path: '/visits',
	tags: ['Visits'],
	summary: 'List your visited regions',
	description:
		'Each scope alphabetical. Before the first change, the regions of your places count as visited.',
	responses: {
		200: jsonResponse(VisitsSchema, 'Visited regions'),
		401: errorResponse('Not signed in'),
	},
})

const setVisitRoute = createRoute({
	method: 'put',
	path: '/visits/{scope}/{region}',
	tags: ['Visits'],
	summary: 'Mark a region visited or not',
	description: 'Answers with both scopes. Sending it twice leaves the same set.',
	middleware: [requireRole('user')] as const,
	request: {
		params: z.object({
			scope: VisitScopeSchema,
			region: RegionSchema.openapi({ description: 'The name its atlas gives the region' }),
		}),
		body: jsonRequest(SetVisitSchema),
	},
	responses: {
		200: jsonResponse(VisitsSchema, 'Visited regions'),
		400: errorResponse('Invalid scope, region or body'),
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
		409: errorResponse(`Already marking ${MAX_VISITS} regions in the scope`),
	},
})

const visitsRoutes = createRouter<UserEnv>()

visitsRoutes.openapi(listVisitsRoute, async (c) => {
	return c.json(await listVisits(requireUser(c).id), 200)
})

visitsRoutes.openapi(setVisitRoute, async (c) => {
	const { scope, region } = c.req.valid('param')

	const { visited } = c.req.valid('json')

	const visits = await setVisit(requireUser(c).id, scope, region, visited)

	if (!visits) {
		throw new HTTPException(409, {
			message: `You can mark up to ${MAX_VISITS.toLocaleString('en-US')} regions`,
		})
	}

	return c.json(visits, 200)
})

export { visitsRoutes }
