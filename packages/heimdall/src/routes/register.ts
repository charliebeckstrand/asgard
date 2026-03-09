import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { rateLimit } from '../middleware/rate-limit.js'
import { DetailSchema, RegisterSchema, UserResponseSchema } from '../schemas.js'
import { AuthError, registerNewUser } from '../services/auth.js'

const registerRoute = createRoute({
	method: 'post',
	path: '/register',
	tags: ['Auth'],
	summary: 'Register a new user',
	request: {
		body: {
			content: { 'application/json': { schema: RegisterSchema } },
			required: true,
		},
	},
	responses: {
		201: {
			content: { 'application/json': { schema: UserResponseSchema } },
			description: 'User created',
		},
		400: {
			content: { 'application/json': { schema: DetailSchema } },
			description: 'Validation error',
		},
		409: {
			content: { 'application/json': { schema: DetailSchema } },
			description: 'Email already registered',
		},
	},
})

export const register = new OpenAPIHono()

register.use('/register', rateLimit())

register.openapi(registerRoute, async (c) => {
	const { email, password } = c.req.valid('json')

	const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'

	try {
		const user = await registerNewUser(email, password, ip)

		return c.json(
			{
				id: user.id,
				email: user.email,
				is_active: user.is_active,
				is_verified: user.is_verified,
				created_at: user.created_at,
			},
			201,
		)
	} catch (err) {
		if (err instanceof AuthError && err.code === 'email_exists') {
			return c.json({ detail: err.message }, 409)
		}
		throw err
	}
})
