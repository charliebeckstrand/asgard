import { createRoute } from '@hono/zod-openapi'
import { createRouter, errorResponse, jsonRequest, jsonResponse } from 'grid'
import { readPlayerName, setPlayerName } from '../handlers/games.js'
import { GamePlayerSchema } from '../lib/schemas.js'
import { requireRole, requireUser, type UserEnv } from '../middleware/user.js'

const getPlayerRoute = createRoute({
	method: 'get',
	path: '/games/player',
	tags: ['Games'],
	summary: 'Get your leaderboard name',
	description: 'The name on the leaderboards of every game, or null when you set none.',
	responses: {
		200: jsonResponse(GamePlayerSchema, 'Your leaderboard name'),
		401: errorResponse('Not signed in'),
	},
})

const setPlayerRoute = createRoute({
	method: 'put',
	path: '/games/player',
	tags: ['Games'],
	summary: 'Set your leaderboard name',
	description:
		'Sets the name on the leaderboards of every game, 1 to 24 characters with the spaces at each end removed. Null removes it, so you show as anonymous.',
	middleware: [requireRole('user')] as const,
	request: {
		body: jsonRequest(GamePlayerSchema),
	},
	responses: {
		200: jsonResponse(GamePlayerSchema, 'Your new leaderboard name'),
		400: errorResponse('Invalid name'),
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
	},
})

const gamesRoutes = createRouter<UserEnv>()

gamesRoutes.openapi(getPlayerRoute, async (c) => {
	return c.json({ name: await readPlayerName(requireUser(c).id) }, 200)
})

gamesRoutes.openapi(setPlayerRoute, async (c) => {
	const { name } = c.req.valid('json')

	await setPlayerName(requireUser(c).id, name)

	return c.json({ name }, 200)
})

export { gamesRoutes }
