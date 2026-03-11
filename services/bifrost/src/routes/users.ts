import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getIpAddress } from 'grid/middleware'
import { AuthError, registerUser } from 'heimdall'
import { EmailSchema, PasswordSchema } from 'skuld'
import { ErrorSchema } from '../lib/schemas.js'
import { requireSession, type SessionEnv } from '../middleware/session.js'

const CreateUserRequestSchema = z
	.object({
		email: EmailSchema,
		password: PasswordSchema,
		name: z.string().min(1).optional(),
	})
	.openapi('CreateUserRequest')

const UserResponseSchema = z
	.object({
		id: z.string(),
		email: z.string(),
	})
	.openapi('UserResponse')

const createUserRoute = createRoute({
	method: 'post',
	path: '/',
	tags: ['Users'],
	summary: 'Create a new user account',
	description: '',
	request: {
		body: {
			content: { 'application/json': { schema: CreateUserRequestSchema } },
			required: true,
		},
	},
	responses: {
		201: {
			content: { 'application/json': { schema: UserResponseSchema } },
			description: 'User created',
		},
		400: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Validation error',
		},
		409: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Email already registered',
		},
	},
})

const usersRoutes = new OpenAPIHono<SessionEnv>()

usersRoutes.use('*', requireSession())

usersRoutes.openapi(createUserRoute, async (c) => {
	const { email, password } = c.req.valid('json')

	const ip = getIpAddress(c)

	try {
		const user = await registerUser(email, password, ip)

		return c.json({ id: user.id, email: user.email }, 201)
	} catch (err) {
		if (err instanceof AuthError && err.code === 'email_exists') {
			return c.json({ error: 'Conflict', message: err.message, statusCode: 409 }, 409)
		}

		throw err
	}
})

export { usersRoutes }
