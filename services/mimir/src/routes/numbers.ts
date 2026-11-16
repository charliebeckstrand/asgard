import { createRoute } from '@hono/zod-openapi'
import { createRouter, errorResponse, jsonRequest, jsonResponse } from 'grid'
import { readNumbersStats, recordNumbersResult } from '../handlers/numbers.js'
import { NumbersResultSchema, NumbersStatsSchema, NumbersTodaySchema } from '../lib/schemas.js'
import { requireRole, requireUser, type UserEnv } from '../middleware/user.js'

const getStatsRoute = createRoute({
	method: 'get',
	path: '/numbers/stats',
	tags: ['Numbers'],
	summary: 'Get your numbers stats',
	description:
		"The stats of each mode. The streaks are as of the reader's date, which must be within one day of the server's date.",
	request: {
		query: NumbersTodaySchema,
	},
	responses: {
		200: jsonResponse(NumbersStatsSchema, 'Stats'),
		400: errorResponse('Invalid date'),
		401: errorResponse('Not signed in'),
	},
})

const recordResultRoute = createRoute({
	method: 'post',
	path: '/numbers/results',
	tags: ['Numbers'],
	summary: 'Count a finished run',
	description:
		"Every run counts, replays included. A run whose seed is the reader's date is the daily puzzle, and only its first run counts toward the daily streak.",
	middleware: [requireRole('user')] as const,
	request: {
		body: jsonRequest(NumbersResultSchema),
	},
	responses: {
		200: jsonResponse(NumbersStatsSchema, 'The new stats'),
		400: errorResponse('Invalid result or date'),
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
	},
})

const numbersRoutes = createRouter<UserEnv>()

numbersRoutes.openapi(getStatsRoute, async (c) => {
	const { today } = c.req.valid('query')

	return c.json(await readNumbersStats(requireUser(c).id, today), 200)
})

numbersRoutes.openapi(recordResultRoute, async (c) => {
	return c.json(await recordNumbersResult(requireUser(c).id, c.req.valid('json')), 200)
})

export { numbersRoutes }
