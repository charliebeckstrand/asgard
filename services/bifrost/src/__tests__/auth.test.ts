import { stubServiceEnv } from 'vali/env'

stubServiceEnv({ CLIENT_IP_HEADER: 'do-connecting-ip' })

const {
	mockAuthenticateUser,
	mockRegisterUser,
	mockCreateSession,
	mockFindSession,
	mockDeleteSession,
	mockDeleteUserSessions,
} = vi.hoisted(() => ({
	mockAuthenticateUser: vi.fn(),
	mockRegisterUser: vi.fn(),
	mockCreateSession: vi.fn(),
	mockFindSession: vi.fn(),
	mockDeleteSession: vi.fn(),
	mockDeleteUserSessions: vi.fn(),
}))

import { AuthError } from '../auth/errors.js'

vi.mock('../auth/index.js', async () => {
	const errors = await vi.importActual<typeof import('../auth/errors.js')>('../auth/errors.js')

	return {
		configure: vi.fn(),
		getConfig: vi.fn(),
		AuthError: errors.AuthError,
		SESSION_TTL_SECONDS: 30 * 24 * 60 * 60,
		authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
		registerUser: (...args: unknown[]) => mockRegisterUser(...args),
		createSession: (...args: unknown[]) => mockCreateSession(...args),
		findSession: (...args: unknown[]) => mockFindSession(...args),
		deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
		deleteUserSessions: (...args: unknown[]) => mockDeleteUserSessions(...args),
	}
})

vi.mock('vidar/client', () => ({
	configure: vi.fn(),
	createVidar: vi.fn().mockReturnValue(async (_c: unknown, next: () => Promise<void>) => {
		await next()
	}),
	reportEvent: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
	db: { ping: vi.fn().mockResolvedValue(true) },
	closePool: vi.fn(),
}))

import { createBifrostApp } from '../app.js'

const ORIGIN = 'http://localhost:3000'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const session = {
	id: 'session-hash',
	created_at: '2026-09-26T00:00:00.000Z',
	expires_at: '2026-10-26T00:00:00.000Z',
	user: {
		id: USER_ID,
		email: 'test@example.com',
		is_active: true,
		is_verified: false,
		role: 'user',
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
	},
}

const app = createBifrostApp()

const cookie = (token = 'token') => ({ Cookie: `__Host-session=${token}` })

function login(headers: Record<string, string> = {}) {
	return app.request('/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
		body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
	})
}

describe('Auth routes', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		mockAuthenticateUser.mockResolvedValue(USER_ID)

		mockCreateSession.mockResolvedValue({ token: 'new-token', session })

		mockFindSession.mockResolvedValue(session)
	})

	describe('POST /auth/login', () => {
		it('starts a session and returns it', async () => {
			const res = await login()

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(session)

			expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, undefined)
		})

		it('sets the token in a __Host- cookie', async () => {
			const setCookie = (await login()).headers.get('set-cookie') ?? ''

			expect(setCookie).toContain('__Host-session=new-token')

			expect(setCookie).toContain('HttpOnly')

			expect(setCookie).toContain('Secure')

			expect(setCookie).toContain('SameSite=Lax')

			expect(setCookie).toContain('Path=/')

			expect(setCookie).not.toContain('Domain')
		})

		it('replaces the session the browser still holds', async () => {
			await login(cookie('old-token'))

			expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, 'old-token')
		})

		it('passes the client IP from the edge header to authenticateUser', async () => {
			await login({ 'do-connecting-ip': '203.0.113.7' })

			expect(mockAuthenticateUser).toHaveBeenCalledWith(
				'test@example.com',
				'password123',
				'203.0.113.7',
			)
		})

		it('returns 401 on invalid credentials', async () => {
			mockAuthenticateUser.mockRejectedValueOnce(
				new AuthError('invalid_credentials', 'Incorrect email or password'),
			)

			const res = await login()

			expect(res.status).toBe(401)

			expect(mockCreateSession).not.toHaveBeenCalled()
		})

		it('returns 403 when the account is inactive', async () => {
			mockAuthenticateUser.mockRejectedValueOnce(
				new AuthError('account_inactive', 'Account is inactive'),
			)

			expect((await login()).status).toBe(403)
		})

		it('rejects a password longer than 128 characters', async () => {
			const res = await app.request('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
				body: JSON.stringify({ email: 'test@example.com', password: 'x'.repeat(129) }),
			})

			expect(res.status).toBe(400)

			expect(mockAuthenticateUser).not.toHaveBeenCalled()
		})
	})

	describe('GET /auth/session', () => {
		it('returns 401 without a cookie and never looks one up', async () => {
			const res = await app.request('/auth/session')

			expect(res.status).toBe(401)

			expect(mockFindSession).not.toHaveBeenCalled()
		})

		it('returns the live session with its user', async () => {
			const res = await app.request('/auth/session', { headers: cookie() })

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(session)

			expect(res.headers.get('cache-control')).toBe('private, no-store')

			expect(mockFindSession).toHaveBeenCalledWith('token')
		})

		it('returns 401 and clears the cookie when the session is gone', async () => {
			mockFindSession.mockResolvedValueOnce(null)

			const res = await app.request('/auth/session', { headers: cookie() })

			expect(res.status).toBe(401)

			expect(res.headers.get('set-cookie')).toContain('__Host-session=;')
		})
	})

	describe('POST /auth/logout', () => {
		it('deletes the current session and clears the cookie', async () => {
			const res = await app.request('/auth/logout', {
				method: 'POST',
				headers: { ...cookie(), Origin: ORIGIN },
			})

			expect(res.status).toBe(200)

			expect(mockDeleteSession).toHaveBeenCalledWith(session.id)

			expect(res.headers.get('set-cookie')).toContain('__Host-session=;')
		})

		it('clears the cookie even without a session', async () => {
			const res = await app.request('/auth/logout', {
				method: 'POST',
				headers: { Origin: ORIGIN },
			})

			expect(res.status).toBe(200)

			expect(mockDeleteSession).not.toHaveBeenCalled()
		})
	})

	describe('DELETE /auth/sessions', () => {
		it('returns 401 without a session', async () => {
			const res = await app.request('/auth/sessions', {
				method: 'DELETE',
				headers: { Origin: ORIGIN },
			})

			expect(res.status).toBe(401)

			expect(mockDeleteUserSessions).not.toHaveBeenCalled()
		})

		it("deletes the user's other sessions and keeps this one", async () => {
			const res = await app.request('/auth/sessions', {
				method: 'DELETE',
				headers: { ...cookie(), Origin: ORIGIN },
			})

			expect(res.status).toBe(204)

			expect(mockDeleteUserSessions).toHaveBeenCalledWith(USER_ID, session.id)
		})
	})

	describe('POST /auth/register', () => {
		it('registers a new user and returns 201', async () => {
			mockRegisterUser.mockResolvedValueOnce({ ...session.user, email: 'new@example.com' })

			const res = await app.request('/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
				body: JSON.stringify({ email: 'new@example.com', password: 'password123' }),
			})

			expect(res.status).toBe(201)

			expect(await res.json()).toEqual({ id: USER_ID, email: 'new@example.com' })
		})

		it('returns 409 when email already exists', async () => {
			mockRegisterUser.mockRejectedValueOnce(
				new AuthError('email_exists', 'Email already registered'),
			)

			const res = await app.request('/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
				body: JSON.stringify({ email: 'existing@example.com', password: 'password123' }),
			})

			expect(res.status).toBe(409)
		})
	})
})
