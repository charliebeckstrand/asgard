import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { type AuthEnv, bearer } from '../middleware/bearer.js'
import { DetailSchema, UserResponseSchema } from '../schemas.js'
import { deactivateUser } from '../services/users.js'

const getMeRoute = createRoute({
	method: 'get',
	path: '/me',
	tags: ['Auth'],
	summary: 'Get current user',
	security: [{ Bearer: [] }],
	responses: {
		200: {
			content: { 'application/json': { schema: UserResponseSchema } },
			description: 'Current user profile',
		},
		401: {
			content: { 'application/json': { schema: DetailSchema } },
			description: 'Not authenticated',
		},
	},
})

const deleteMeRoute = createRoute({
	method: 'delete',
	path: '/me',
	tags: ['Auth'],
	summary: 'Deactivate account',
	security: [{ Bearer: [] }],
	responses: {
		204: {
			description: 'Account deactivated',
		},
		401: {
			content: { 'application/json': { schema: DetailSchema } },
			description: 'Not authenticated',
		},
	},
})

export const me = new OpenAPIHono<AuthEnv>()

me.use('/me', bearer())

me.openapi(getMeRoute, async (c) => {
	const user = c.get('user')

	return c.json(
		{
			id: user.id,
			email: user.email,
			is_active: user.is_active,
			is_verified: user.is_verified,
			created_at: user.created_at,
		},
		200,
	)
})

me.openapi(deleteMeRoute, async (c) => {
	const user = c.get('user')

	await deactivateUser(user.id)

	return c.body(null, 204)
})
