import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { apiKeyAuth } from '../middleware/api-key.js'
import { DetailSchema, UserResponseSchema, VerifySchema } from '../schemas.js'
import { AuthError, verifyAccessToken } from '../services/auth.js'

const verifyRoute = createRoute({
	method: 'post',
	path: '/token/verify',
	tags: ['Auth'],
	summary: 'Verify an access token',
	description: 'Service-to-service token verification. Optionally protected by API key.',
	security: [{ ApiKey: [] }],
	request: {
		body: {
			content: { 'application/json': { schema: VerifySchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { 'application/json': { schema: UserResponseSchema } },
			description: 'Token is valid',
		},
		401: {
			content: { 'application/json': { schema: DetailSchema } },
			description: 'Invalid token or API key',
		},
	},
})

export const verify = new OpenAPIHono()

verify.use('/token/verify', apiKeyAuth())

verify.openapi(verifyRoute, async (c) => {
	const { token } = c.req.valid('json')

	try {
		const user = await verifyAccessToken(token)

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
	} catch (err) {
		if (err instanceof AuthError) {
			return c.json({ detail: err.message }, 401)
		}
		throw err
	}
})
