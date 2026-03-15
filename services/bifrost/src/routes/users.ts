import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { validationHook } from 'grid'
import { getIpAddress } from 'grid/middleware'
import { EmailSchema, ErrorSchema, PasswordSchema } from 'skuld'
import { getConfig } from '../auth/index.js'
import { handleRegisterUser } from '../handlers/register.js'
import { createChatRepository } from '../lib/chat-repository.js'
import { requireSession, type SessionEnv } from '../middleware/session.js'

const UserIdParamSchema = z.object({
	id: z.string().uuid(),
})

const CreateUserRequestSchema = z
	.object({
		email: EmailSchema,
		password: PasswordSchema,
		name: z.string().min(1).optional(),
	})
	.openapi('CreateUserRequest')

const UpdateUserRequestSchema = z
	.object({
		email: EmailSchema.optional(),
		is_active: z.boolean().optional(),
	})
	.openapi('UpdateUserRequest')

const UserResponseSchema = z
	.object({
		id: z.string(),
		email: z.string(),
		is_active: z.boolean(),
		is_verified: z.boolean(),
		created_at: z.string(),
		updated_at: z.string(),
	})
	.openapi('UserResponse')

const CreateUserResponseSchema = z
	.object({
		id: z.string(),
		email: z.string(),
	})
	.openapi('CreateUserResponse')

const listUsersRoute = createRoute({
	method: 'get',
	path: '/',
	tags: ['Users'],
	summary: 'List all users',
	responses: {
		200: {
			content: { 'application/json': { schema: z.array(UserResponseSchema) } },
			description: 'List of users',
		},
	},
})

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
			content: { 'application/json': { schema: CreateUserResponseSchema } },
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

const getUserRoute = createRoute({
	method: 'get',
	path: '/{id}',
	tags: ['Users'],
	summary: 'Get a user by ID',
	request: {
		params: UserIdParamSchema,
	},
	responses: {
		200: {
			content: { 'application/json': { schema: UserResponseSchema } },
			description: 'User found',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'User not found',
		},
	},
})

const updateUserRoute = createRoute({
	method: 'put',
	path: '/{id}',
	tags: ['Users'],
	summary: 'Update a user',
	request: {
		params: UserIdParamSchema,
		body: {
			content: { 'application/json': { schema: UpdateUserRequestSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { 'application/json': { schema: UserResponseSchema } },
			description: 'User updated',
		},
		400: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Validation error',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'User not found',
		},
	},
})

const deleteUserRoute = createRoute({
	method: 'delete',
	path: '/{id}',
	tags: ['Users'],
	summary: 'Delete a user',
	request: {
		params: UserIdParamSchema,
	},
	responses: {
		204: {
			description: 'User deleted',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'User not found',
		},
	},
})

const UserChatResponseSchema = z
	.object({
		id: z.string(),
		created_at: z.string(),
		updated_at: z.string(),
	})
	.openapi('UserChatResponse')

const listUserChatsRoute = createRoute({
	method: 'get',
	path: '/{id}/chats',
	tags: ['Users'],
	summary: 'List chats for a user',
	request: {
		params: UserIdParamSchema,
	},
	responses: {
		200: {
			content: { 'application/json': { schema: z.array(UserChatResponseSchema) } },
			description: 'List of chats',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'User not found',
		},
	},
})

const chatRepository = createChatRepository()

const usersRoutes = new OpenAPIHono<SessionEnv>({ defaultHook: validationHook })

usersRoutes.use('*', requireSession())

usersRoutes.openapi(listUsersRoute, async (c) => {
	const { userRepository } = getConfig()

	const users = await userRepository.getUsers()

	return c.json(users, 200)
})

usersRoutes.openapi(createUserRoute, async (c) => {
	const { email, password } = c.req.valid('json')

	const ip = getIpAddress(c)

	return handleRegisterUser(c, email, password, ip)
})

usersRoutes.openapi(getUserRoute, async (c) => {
	const { id } = c.req.valid('param')

	const { userRepository } = getConfig()

	const user = await userRepository.getUserById(id)

	if (!user) {
		return c.json({ error: 'Not Found', message: 'User not found', statusCode: 404 }, 404)
	}

	return c.json(user, 200)
})

usersRoutes.openapi(updateUserRoute, async (c) => {
	const { id } = c.req.valid('param')
	const data = c.req.valid('json')

	const { userRepository } = getConfig()

	const user = await userRepository.updateUser(id, data)

	if (!user) {
		return c.json({ error: 'Not Found', message: 'User not found', statusCode: 404 }, 404)
	}

	return c.json(user, 200)
})

usersRoutes.openapi(deleteUserRoute, async (c) => {
	const { id } = c.req.valid('param')

	const { userRepository } = getConfig()

	const deleted = await userRepository.deleteUser(id)

	if (!deleted) {
		return c.json({ error: 'Not Found', message: 'User not found', statusCode: 404 }, 404)
	}

	return c.body(null, 204)
})

usersRoutes.openapi(listUserChatsRoute, async (c) => {
	const { id } = c.req.valid('param')

	const { userRepository } = getConfig()

	const user = await userRepository.getUserById(id)

	if (!user) {
		return c.json({ error: 'Not Found', message: 'User not found', statusCode: 404 }, 404)
	}

	const chats = await chatRepository.getChats(id)

	return c.json(chats, 200)
})

export { usersRoutes }
