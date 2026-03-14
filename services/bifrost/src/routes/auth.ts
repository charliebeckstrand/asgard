import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { validationHook } from 'grid'
import { getIpAddress } from 'grid/middleware'
import { EmailSchema, ErrorSchema, LoginPasswordSchema, PasswordSchema } from 'skuld'
import { authenticateUser, getConfig } from '../auth/index.js'
import { verifyToken } from '../auth/jwt.js'
import { handleRegisterUser } from '../handlers/register.js'
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

const MessageSchema = z.object({ message: z.string() }).openapi('AuthMessage')

const loginRoute = createRoute({
	method: 'post',
	path: '/login',
	tags: ['Auth'],
	summary: 'Login with email and password',
	description: 'Authenticates credentials and sets a session cookie.',
	request: {
		body: {
			content: { 'application/json': { schema: LoginRequestSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { 'application/json': { schema: LoginResponseSchema } },
			description: 'Login successful',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Invalid credentials',
		},
		403: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Account inactive',
		},
	},
})

const logoutRoute = createRoute({
	method: 'post',
	path: '/logout',
	tags: ['Auth'],
	summary: 'Logout and clear session',
	responses: {
		200: {
			content: { 'application/json': { schema: MessageSchema } },
			description: 'Logged out',
		},
	},
})

const registerRoute = createRoute({
	method: 'post',
	path: '/register',
	tags: ['Auth'],
	summary: 'Register a new account',
	description: 'Creates a new user account.',
	request: {
		body: {
			content: { 'application/json': { schema: RegisterRequestSchema } },
			required: true,
		},
	},
	responses: {
		201: {
			content: { 'application/json': { schema: RegisterResponseSchema } },
			description: 'Account created',
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

const sessionRoute = createRoute({
	method: 'get',
	path: '/session',
	tags: ['Auth'],
	summary: 'Get current session',
	description: 'Returns session info if authenticated, 401 otherwise.',
	responses: {
		200: {
			content: { 'application/json': { schema: SessionResponseSchema } },
			description: 'Active session',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Not authenticated',
		},
	},
})

const userRoute = createRoute({
	method: 'get',
	path: '/user',
	tags: ['Auth'],
	summary: 'Get authenticated user',
	description: "Returns the current authenticated user's details.",
	responses: {
		200: {
			content: { 'application/json': { schema: AuthUserResponseSchema } },
			description: 'Authenticated user',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Not authenticated',
		},
	},
})

export const authRoutes = new OpenAPIHono<SessionEnv>({ defaultHook: validationHook })
	.openapi(loginRoute, async (c) => {
		const env = environment()

		if (!env.SESSION_SECRET) {
			throw new Error('SESSION_SECRET is not configured')
		}

		const { email, password } = c.req.valid('json')

		const ip = getIpAddress(c)

		const tokens = await authenticateUser(email, password, ip)

		const sessionData: SessionData = {
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresAt: Math.floor(Date.now() / 1000) + 30 * 60,
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
			return c.json({ error: 'Unauthorized', message: 'Not authenticated', statusCode: 401 }, 401)
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
			return c.json({ error: 'Unauthorized', message: 'Not authenticated', statusCode: 401 }, 401)
		}

		const payload = await verifyToken(session.accessToken)

		const { userRepository } = getConfig()

		const user = await userRepository.getUserById(payload.sub as string)

		if (!user) {
			return c.json({ error: 'Unauthorized', message: 'Not authenticated', statusCode: 401 }, 401)
		}

		return c.json(user, 200)
	})
	.openapi(registerRoute, async (c) => {
		const { email, password } = c.req.valid('json')

		const ip = getIpAddress(c)

		return handleRegisterUser(c, email, password, ip)
	})
