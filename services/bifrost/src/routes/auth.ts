import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { loadEnv } from '../lib/env.js'
import { ErrorSchema } from '../lib/schemas.js'
import { clearSessionCookie, type SessionData, setSessionCookie } from '../middleware/session.js'

// --- Schemas ---

const LoginRequestSchema = z
	.object({
		email: z.string().email(),
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
		email: z.string().email(),
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

// --- Heimdall response type ---

type HeimdallTokenResponse = {
	access_token: string
	refresh_token: string
	token_type: string
	expires_in: number
}

// --- Routes ---

const loginRoute = createRoute({
	method: 'post',
	path: '/login',
	tags: ['Auth'],
	summary: 'Login with email and password',
	description: 'Authenticates against Heimdall and sets a session cookie.',
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
		502: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Upstream unavailable',
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
	description: 'Proxies registration to Heimdall.',
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
		502: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Upstream unavailable',
		},
	},
})

// --- Handlers ---

export const authRoutes = new OpenAPIHono()
	.openapi(loginRoute, async (c) => {
		const env = loadEnv()

		if (!env.HEIMDALL_URL) {
			return c.json(
				{ error: 'Bad Gateway', message: 'HEIMDALL_URL is not configured', statusCode: 502 },
				502,
			)
		}

		if (!env.SESSION_SECRET) {
			return c.json(
				{
					error: 'Internal Server Error',
					message: 'SESSION_SECRET is not configured',
					statusCode: 500,
				},
				500,
			)
		}

		const body = c.req.valid('json')

		let res: Response

		try {
			res = await fetch(`${env.HEIMDALL_URL}/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
		} catch {
			return c.json({ error: 'Bad Gateway', message: 'Upstream unavailable', statusCode: 502 }, 502)
		}

		if (!res.ok) {
			return c.json({ error: 'Unauthorized', message: 'Invalid credentials', statusCode: 401 }, 401)
		}

		const data = (await res.json()) as HeimdallTokenResponse

		const sessionData: SessionData = {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
		}

		await setSessionCookie(c, sessionData, env.SESSION_SECRET)

		return c.json(
			{
				access_token: data.access_token,
				token_type: 'bearer' as const,
				expires_in: data.expires_in,
			},
			200,
		)
	})
	.openapi(logoutRoute, async (c) => {
		clearSessionCookie(c)

		return c.json({ message: 'Logged out' }, 200)
	})
	.openapi(sessionRoute, async (c) => {
		const session = c.get('session') as SessionData | null

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
		const env = loadEnv()

		if (!env.HEIMDALL_URL) {
			return c.json(
				{ error: 'Bad Gateway', message: 'HEIMDALL_URL is not configured', statusCode: 502 },
				502,
			)
		}

		const body = c.req.valid('json')

		let res: Response

		try {
			res = await fetch(`${env.HEIMDALL_URL}/auth/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
		} catch {
			return c.json({ error: 'Bad Gateway', message: 'Upstream unavailable', statusCode: 502 }, 502)
		}

		const data = await res.json()

		if (!res.ok) {
			const status = res.status === 409 ? 409 : 400

			return c.json(
				{
					error: status === 409 ? 'Conflict' : 'Bad Request',
					message: (data as { detail?: string }).detail ?? 'Registration failed',
					statusCode: status,
				},
				status,
			)
		}

		return c.json(data as { id: string; email: string }, 201)
	})
