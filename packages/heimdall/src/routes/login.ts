import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { rateLimit } from '../middleware/rate-limit.js'
import { DetailSchema, LoginSchema, TokenResponseSchema } from '../schemas.js'
import { AuthError, authenticateUser } from '../services/auth.js'

const loginRoute = createRoute({
	method: 'post',
	path: '/login',
	tags: ['Auth'],
	summary: 'Authenticate and receive tokens',
	request: {
		body: {
			content: { 'application/json': { schema: LoginSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { 'application/json': { schema: TokenResponseSchema } },
			description: 'Login successful',
		},
		401: {
			content: { 'application/json': { schema: DetailSchema } },
			description: 'Invalid credentials',
		},
		403: {
			content: { 'application/json': { schema: DetailSchema } },
			description: 'Account inactive',
		},
	},
})

export const login = new OpenAPIHono()

login.use('/login', rateLimit())

login.openapi(loginRoute, async (c) => {
	const { email, password } = c.req.valid('json')

	const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'

	try {
		const tokens = await authenticateUser(email, password, ip)

		return c.json(tokens, 200)
	} catch (err) {
		if (err instanceof AuthError) {
			if (err.code === 'account_inactive') {
				return c.json({ detail: err.message }, 403)
			}
			return c.json({ detail: err.message }, 401)
		}
		throw err
	}
})
