import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getClientIp } from 'grid'
import { AuthError, authenticateUser, registerNewUser } from 'heimdall'
import { loadEnv } from '../lib/env.js'
import { ErrorSchema } from '../lib/schemas.js'
import {
	clearSessionCookie,
	type SessionData,
	type SessionEnv,
	setSessionCookie,
} from '../middleware/session.js'

// --- Schemas ---

const LoginRequestSchema = z
	.object({
		email: z.email(),
		password: z.string().min(1),
	})
	.openapi('LoginRequest')

const LoginResponseSchema = z
	.object({
		access_token: z.string(),
		token_type: z.literal('bearer'),
		expires_in: z.number(),
	})
	.openapi('LoginResponse')

const SessionResponseSchema = z
	.object({
		authenticated: z.literal(true),
		expiresAt: z.number(),
	})
	.openapi('SessionResponse')

const RegisterRequestSchema = z
	.object({
		email: z.email(),
		password: z.string().min(8),
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

// --- Routes ---

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

// --- Handlers ---

export const authRoutes = new OpenAPIHono<SessionEnv>()
	.openapi(loginRoute, async (c) => {
		const env = loadEnv()

		if (!env.SESSION_SECRET) {
			throw new Error('SESSION_SECRET is not configured')
		}

		const { email, password } = c.req.valid('json')

		const ip = getClientIp(c)

		try {
			const tokens = await authenticateUser(email, password, ip)

			const sessionData: SessionData = {
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
			}

			await setSessionCookie(c, sessionData, env.SESSION_SECRET)

			return c.json(
				{
					access_token: tokens.access_token,
					token_type: 'bearer' as const,
					expires_in: tokens.expires_in,
				},
				200,
			)
		} catch (err) {
			if (err instanceof AuthError) {
				if (err.code === 'account_inactive') {
					return c.json({ error: 'Forbidden', message: err.message, statusCode: 403 }, 403)
				}
				return c.json({ error: 'Unauthorized', message: err.message, statusCode: 401 }, 401)
			}
			throw err
		}
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

		return c.json(
			{
				authenticated: true as const,
				expiresAt: session.expiresAt,
			},
			200,
		)
	})
	.openapi(registerRoute, async (c) => {
		const { email, password } = c.req.valid('json')

		const ip = getClientIp(c)

		try {
			const user = await registerNewUser(email, password, ip)

			return c.json({ id: user.id, email: user.email }, 201)
		} catch (err) {
			if (err instanceof AuthError && err.code === 'email_exists') {
				return c.json({ error: 'Conflict', message: err.message, statusCode: 409 }, 409)
			}

			throw err
		}
	})
