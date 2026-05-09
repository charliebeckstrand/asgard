import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { errorResponse, HTTPException, jsonRequest, jsonResponse, validationHook } from 'grid'
import { getIpAddress } from 'grid/middleware'
import { EmailSchema, LoginPasswordSchema, MessageSchema, PasswordSchema } from 'skuld'
import { authenticateUser, getConfig, registerUser } from '../auth/index.js'
import { ACCESS_TOKEN_TTL_SECONDS, verifyToken } from '../auth/jwt.js'
import { environment } from '../lib/env.js'
import {
	clearSessionCookie,
	type SessionData,
	type SessionEnv,
	setSessionCookie,
} from '../middleware/session.js'

const LoginRequestSchema = z
	.object({
		email: EmailSchema,
		password: LoginPasswordSchema,
	})
	.openapi('LoginRequest')

const LoginResponseSchema = z
	.object({
		access_token: z.string(),
		token_type: z.literal('bearer'),
	})
	.openapi('LoginResponse')

const SessionResponseSchema = z
	.object({
		authenticated: z.literal(true),
		expiresAt: z.number(),
	})
	.openapi('SessionResponse')

const AuthUserResponseSchema = z
	.object({
		id: z.string(),
		email: z.string(),
		is_active: z.boolean(),
		is_verified: z.boolean(),
		created_at: z.string(),
		updated_at: z.string(),
	})
	.openapi('AuthUserResponse')

const RegisterRequestSchema = z
	.object({
		email: EmailSchema,
		password: PasswordSchema,
		name: z.string().min(1).optional(),
	})
	.openapi('RegisterRequest')

const RegisterResponseSchema = z
	.object({
		id: z.string(),
		email: z.string(),
	})
	.openapi('RegisterResponse')

const loginRoute = createRoute({
	method: 'post',
	path: '/login',
	tags: ['Auth'],
	summary: 'Login with email and password',
	description: 'Authenticates credentials and sets a session cookie.',
	request: {
		body: jsonRequest(LoginRequestSchema),
	},
	responses: {
		200: jsonResponse(LoginResponseSchema, 'Login successful'),
		401: errorResponse('Invalid credentials'),
		403: errorResponse('Account inactive'),
	},
})

const logoutRoute = createRoute({
	method: 'post',
	path: '/logout',
	tags: ['Auth'],
	summary: 'Logout and clear session',
	responses: {
		200: jsonResponse(MessageSchema, 'Logged out'),
	},
})

const registerRoute = createRoute({
	method: 'post',
	path: '/register',
	tags: ['Auth'],
	summary: 'Register a new account',
	description: 'Creates a new user account.',
	request: {
		body: jsonRequest(RegisterRequestSchema),
	},
	responses: {
		201: jsonResponse(RegisterResponseSchema, 'Account created'),
		400: errorResponse('Validation error'),
		409: errorResponse('Email already registered'),
	},
})

const sessionRoute = createRoute({
	method: 'get',
	path: '/session',
	tags: ['Auth'],
	summary: 'Get current session',
	description: 'Returns session info if authenticated, 401 otherwise.',
	responses: {
		200: jsonResponse(SessionResponseSchema, 'Active session'),
		401: errorResponse('Not authenticated'),
	},
})

const userRoute = createRoute({
	method: 'get',
	path: '/user',
	tags: ['Auth'],
	summary: 'Get authenticated user',
	description: "Returns the current authenticated user's details.",
	responses: {
		200: jsonResponse(AuthUserResponseSchema, 'Authenticated user'),
		401: errorResponse('Not authenticated'),
	},
})

export const authRoutes = new OpenAPIHono<SessionEnv>({ defaultHook: validationHook })
	.openapi(loginRoute, async (c) => {
		const env = environment()

		const { email, password } = c.req.valid('json')

		const ip = getIpAddress(c)

		const tokens = await authenticateUser(email, password, ip)

		const sessionData: SessionData = {
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresAt: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
		}

		await setSessionCookie(c, sessionData, env.SESSION_SECRET)

		return c.json(
			{
				access_token: tokens.access_token,
				token_type: 'bearer' as const,
			},
			200,
		)
	})
	.openapi(logoutRoute, async (c) => {
		clearSessionCookie(c)

		return c.json({ message: 'Logged out' }, 200)
	})
	.openapi(sessionRoute, async (c) => {
		const session = c.get('session')

		if (!session) {
			throw new HTTPException(401, { message: 'Not authenticated' })
		}

		c.header('Cache-Control', 'private, max-age=60')

		return c.json(
			{
				authenticated: true as const,
				expiresAt: session.expiresAt,
			},
			200,
		)
	})
	.openapi(userRoute, async (c) => {
		const session = c.get('session')

		if (!session) {
			throw new HTTPException(401, { message: 'Not authenticated' })
		}

		const payload = await verifyToken(session.accessToken)

		if (typeof payload.sub !== 'string') {
			throw new HTTPException(401, { message: 'Not authenticated' })
		}

		const { userRepository } = getConfig()

		const user = await userRepository.getUserById(payload.sub)

		if (!user) {
			throw new HTTPException(401, { message: 'Not authenticated' })
		}

		return c.json(user, 200)
	})
	.openapi(registerRoute, async (c) => {
		const { email, password } = c.req.valid('json')

		const ip = getIpAddress(c)

		const user = await registerUser(email, password, ip)

		return c.json({ id: user.id, email: user.email }, 201)
	})
