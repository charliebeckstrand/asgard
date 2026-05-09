import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { errorResponse, HttpError, jsonRequest, jsonResponse, validationHook } from 'grid'
import { getIpAddress } from 'grid/middleware'
import { EmailSchema, PasswordSchema } from 'skuld'
import { getConfig, registerUser } from '../auth/index.js'
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
		200: jsonResponse(z.array(UserResponseSchema), 'List of users'),
	},
})

const createUserRoute = createRoute({
	method: 'post',
	path: '/',
	tags: ['Users'],
	summary: 'Create a new user account',
	description: '',
	request: {
		body: jsonRequest(CreateUserRequestSchema),
	},
	responses: {
		201: jsonResponse(CreateUserResponseSchema, 'User created'),
		400: errorResponse('Validation error'),
		409: errorResponse('Email already registered'),
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
		200: jsonResponse(UserResponseSchema, 'User found'),
		404: errorResponse('User not found'),
	},
})

const updateUserRoute = createRoute({
	method: 'put',
	path: '/{id}',
	tags: ['Users'],
	summary: 'Update a user',
	request: {
		params: UserIdParamSchema,
		body: jsonRequest(UpdateUserRequestSchema),
	},
	responses: {
		200: jsonResponse(UserResponseSchema, 'User updated'),
		400: errorResponse('Validation error'),
		404: errorResponse('User not found'),
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
		404: errorResponse('User not found'),
	},
})

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

	const user = await registerUser(email, password, ip)

	return c.json({ id: user.id, email: user.email }, 201)
})

usersRoutes.openapi(getUserRoute, async (c) => {
	const { id } = c.req.valid('param')

	const { userRepository } = getConfig()

	const user = await userRepository.getUserById(id)

	if (!user) {
		throw new HttpError(404, 'User not found', 'Not Found')
	}

	return c.json(user, 200)
})

usersRoutes.openapi(updateUserRoute, async (c) => {
	const { id } = c.req.valid('param')
	const data = c.req.valid('json')

	const { userRepository } = getConfig()

	const user = await userRepository.updateUser(id, data)

	if (!user) {
		throw new HttpError(404, 'User not found', 'Not Found')
	}

	return c.json(user, 200)
})

usersRoutes.openapi(deleteUserRoute, async (c) => {
	const { id } = c.req.valid('param')

	const { userRepository } = getConfig()

	const deleted = await userRepository.deleteUser(id)

	if (!deleted) {
		throw new HttpError(404, 'User not found', 'Not Found')
	}

	return c.body(null, 204)
})

export { usersRoutes }
