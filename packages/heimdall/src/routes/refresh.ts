import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { DetailSchema, RefreshSchema, TokenResponseSchema } from '../schemas.js'
import { AuthError, refreshTokenPair } from '../services/auth.js'

const refreshRoute = createRoute({
	method: 'post',
	path: '/token/refresh',
	tags: ['Auth'],
	summary: 'Refresh access token',
	request: {
		body: {
			content: { 'application/json': { schema: RefreshSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { 'application/json': { schema: TokenResponseSchema } },
			description: 'Tokens refreshed',
		},
		401: {
			content: { 'application/json': { schema: DetailSchema } },
			description: 'Invalid refresh token',
		},
	},
})

export const refresh = new OpenAPIHono().openapi(refreshRoute, async (c) => {
	const { refresh_token } = c.req.valid('json')

	try {
		const tokens = await refreshTokenPair(refresh_token)

		return c.json(tokens, 200)
	} catch (err) {
		if (err instanceof AuthError) {
			return c.json({ detail: err.message }, 401)
		}
		throw err
	}
})
