import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, errorResponse, jsonRequest, jsonResponse } from 'grid'
import { deletePicks, listPicks, savePicks } from '../handlers/predictions.js'
import {
	SavePicksSchema,
	SeasonPicksSchema,
	SeasonSchema,
	WeekPicksSchema,
	WeekSchema,
} from '../lib/schemas.js'
import { requireRole, requireUser, type UserEnv } from '../middleware/user.js'

const weekParams = z.object({ season: SeasonSchema, week: WeekSchema })

const listPicksRoute = createRoute({
	method: 'get',
	path: '/predictions/{season}',
	tags: ['Predictions'],
	summary: 'List your picks of a season',
	description: 'Each week with picks, by week number. A week with none is absent.',
	request: {
		params: z.object({ season: SeasonSchema }),
	},
	responses: {
		200: jsonResponse(SeasonPicksSchema, 'Picks'),
		400: errorResponse('Invalid season'),
		401: errorResponse('Not signed in'),
	},
})

const savePicksRoute = createRoute({
	method: 'put',
	path: '/predictions/{season}/{week}',
	tags: ['Predictions'],
	summary: 'Replace your picks of a week',
	description: 'The picks app checks which games can still take a pick before it sends them.',
	middleware: [requireRole('user')] as const,
	request: {
		params: weekParams,
		body: jsonRequest(SavePicksSchema),
	},
	responses: {
		200: jsonResponse(WeekPicksSchema, 'Picks saved'),
		400: errorResponse('Invalid season, week or picks'),
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
	},
})

const deletePicksRoute = createRoute({
	method: 'delete',
	path: '/predictions/{season}/{week}',
	tags: ['Predictions'],
	summary: 'Delete your picks of a week',
	description: 'Sending it twice leaves the same picks.',
	middleware: [requireRole('user')] as const,
	request: {
		params: weekParams,
	},
	responses: {
		204: { description: 'Picks deleted' },
		400: errorResponse('Invalid season or week'),
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
	},
})

const predictionsRoutes = createRouter<UserEnv>()

predictionsRoutes.openapi(listPicksRoute, async (c) => {
	const { season } = c.req.valid('param')

	return c.json(await listPicks(requireUser(c).id, season), 200)
})

predictionsRoutes.openapi(savePicksRoute, async (c) => {
	const { season, week } = c.req.valid('param')

	const { picks } = c.req.valid('json')

	return c.json(await savePicks(requireUser(c).id, season, week, picks), 200)
})

predictionsRoutes.openapi(deletePicksRoute, async (c) => {
	const { season, week } = c.req.valid('param')

	await deletePicks(requireUser(c).id, season, week)

	return c.body(null, 204)
})

export { predictionsRoutes }
