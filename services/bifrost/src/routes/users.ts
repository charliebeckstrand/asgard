import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { errorResponse, HTTPException, jsonRequest, jsonResponse, validationHook } from 'grid'
import { createListSchema, IdSchema, toList, UserSchema } from 'skuld'
import { deleteUserSessions, getConfig } from '../auth/index.js'
import { requireAdmin, type SessionEnv } from '../middleware/session.js'

// Admins manage an account's standing, never its credentials: no passwords,
// no email, no roles. They also can't act on other admins; admins are made
// and unmade by the operator.

const UserIdParamSchema = z.object({
	id: IdSchema,
})

const UserListSchema = createListSchema(UserSchema, 'UserList')

const UpdateUserRequestSchema = z
	.object({
		is_active: z.boolean(),
	})
	.openapi('UpdateUserRequest')

const listUsersRoute = createRoute({
	method: 'get',
	path: '/',
	tags: ['Users'],
	summary: 'List all users',
	responses: {
		200: jsonResponse(UserListSchema, 'List of users'),
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
		200: jsonResponse(UserSchema, 'User found'),
		404: errorResponse('User not found'),
	},
})

const updateUserRoute = createRoute({
	method: 'patch',
	path: '/{id}',
	tags: ['Users'],
	summary: 'Deactivate or reactivate a user',
	description: 'Deactivating signs the user out everywhere. Admin accounts cannot be changed.',
	request: {
		params: UserIdParamSchema,
		body: jsonRequest(UpdateUserRequestSchema),
	},
	responses: {
		200: jsonResponse(UserSchema, 'User updated'),
		400: errorResponse('Validation error'),
		403: errorResponse('Admin accounts cannot be changed'),
		404: errorResponse('User not found'),
	},
})

const usersRoutes = new OpenAPIHono<SessionEnv>({ defaultHook: validationHook })

usersRoutes.use('*', requireAdmin())

usersRoutes.openapi(listUsersRoute, async (c) => {
	const { userRepository } = getConfig()

	const users = await userRepository.getUsers()

	return c.json(toList(users), 200)
})

usersRoutes.openapi(getUserRoute, async (c) => {
	const { id } = c.req.valid('param')

	const { userRepository } = getConfig()

	const user = await userRepository.getUserById(id)

	if (!user) {
		throw new HTTPException(404, { message: 'User not found' })
	}

	return c.json(user, 200)
})

usersRoutes.openapi(updateUserRoute, async (c) => {
	const { id } = c.req.valid('param')

	const { is_active } = c.req.valid('json')

	const { userRepository } = getConfig()

	const target = await userRepository.getUserById(id)

	if (!target) {
		throw new HTTPException(404, { message: 'User not found' })
	}

	if (target.role === 'admin') {
		throw new HTTPException(403, { message: 'Admin accounts cannot be changed' })
	}

	const user = await userRepository.setUserActive(id, is_active)

	if (!user) {
		throw new HTTPException(403, { message: 'Admin accounts cannot be changed' })
	}

	if (!is_active) {
		await deleteUserSessions(id)
	}

	return c.json(user, 200)
})

export { usersRoutes }
