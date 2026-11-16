import { createRoute } from '@hono/zod-openapi'
import { createRouter, errorResponse, jsonRequest, jsonResponse } from 'grid'
import { readNumbersBoard, readNumbersStats, recordNumbersResult } from '../handlers/numbers.js'
import {
	NumbersBoardQuerySchema,
	NumbersBoardSchema,
	NumbersResultSchema,
	NumbersStatsSchema,
	NumbersTodaySchema,
} from '../lib/schemas.js'
import { requireRole, requireUser, type UserEnv } from '../middleware/user.js'

const getStatsRoute = createRoute({
	method: 'get',
	path: '/games/numbers/stats',
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
	path: '/games/numbers/results',
	tags: ['Numbers'],
	summary: 'Count a finished run',
	description:
		"Every run counts, replays included. A run whose seed is the reader's date is the daily puzzle, and only its first run counts toward the daily streak. Each run also counts on the leaderboard of the reader's date: a solo run of the daily puzzle on `daily`, another solo run on `solo`, and a run against the CPU on `vsCpu`. A board keeps the best score of each player. Each run keeps the name of the account, which the leaderboards show.",
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

const getBoardRoute = createRoute({
	method: 'get',
	path: '/games/numbers/daily',
	tags: ['Numbers'],
	summary: 'Get a leaderboard of a day',
	description:
		"The best score of each player on the board `mode` of the day `date`: the top 10 by score, then the reader when they are below them. Equal scores share a rank and list in the order that the players got them. A date more than one day ahead of the server's date is refused. A reader with no session gets the top 10, with no entry of their own.",
	request: {
		query: NumbersBoardQuerySchema,
	},
	responses: {
		200: jsonResponse(NumbersBoardSchema, 'The leaderboard'),
		400: errorResponse('Invalid date or mode'),
	},
})

const numbersRoutes = createRouter<UserEnv>()

numbersRoutes.openapi(getStatsRoute, async (c) => {
	const { today } = c.req.valid('query')

	return c.json(await readNumbersStats(requireUser(c).id, today), 200)
})

numbersRoutes.openapi(recordResultRoute, async (c) => {
	const { id, name } = requireUser(c)

	return c.json(await recordNumbersResult(id, name, c.req.valid('json')), 200)
})

numbersRoutes.openapi(getBoardRoute, async (c) => {
	const { date, mode } = c.req.valid('query')

	return c.json(await readNumbersBoard(c.get('user')?.id ?? null, date, mode), 200)
})

export { numbersRoutes }
