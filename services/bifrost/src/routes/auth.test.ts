import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_SECRET = 'test-secret-that-is-at-least-32-chars-long'

vi.stubEnv('SESSION_SECRET', MOCK_SECRET)
vi.stubEnv('DATABASE_URL', 'postgres://test:test@localhost:5432/test')
vi.stubEnv('SECRET_KEY', 'test-secret-key-that-is-at-least-32-chars')

// Use vi.hoisted so mock values are available when vi.mock is hoisted
const { MockAuthError, mockAuthenticateUser, mockRegisterNewUser } = vi.hoisted(() => {
	class MockAuthError extends Error {
		code: string
		constructor(code: string, message: string) {
			super(message)
			this.code = code
			this.name = 'AuthError'
		}
	}
	return {
		MockAuthError,
		mockAuthenticateUser: vi.fn(),
		mockRegisterNewUser: vi.fn(),
	}
})

vi.mock('heimdall', () => ({
	configure: vi.fn(),
	authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
	registerNewUser: (...args: unknown[]) => mockRegisterNewUser(...args),
	AuthError: MockAuthError,
	vidarBanCheck: vi.fn().mockReturnValue(async (_c: unknown, next: () => Promise<void>) => {
		await next()
	}),
	rateLimit: vi.fn().mockReturnValue(async (_c: unknown, next: () => Promise<void>) => {
		await next()
	}),
	reportEvent: vi.fn(),
	checkHealth: vi.fn().mockResolvedValue(true),
	refreshTokenPair: vi.fn(),
}))

import { createBifrostApp } from '../app.js'

const app = createBifrostApp()

function getCookieFromResponse(res: Response): string | undefined {
	const setCookie = res.headers.get('set-cookie')

	if (!setCookie) return undefined

	const match = setCookie.match(/bifrost_session=([^;]+)/)

	return match?.[1]
}

describe('Auth routes', () => {
	beforeEach(() => {
		mockAuthenticateUser.mockReset()
		mockRegisterNewUser.mockReset()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('POST /auth/login', () => {
		it('returns 200 and sets session cookie on successful login', async () => {
			mockAuthenticateUser.mockResolvedValueOnce({
				access_token: 'at_test123',
				refresh_token: 'rt_test123',
				token_type: 'bearer',
				expires_in: 3600,
			})

			const res = await app.request('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
			})

			expect(res.status).toBe(200)

			const body = (await res.json()) as {
				access_token: string
				token_type: string
				expires_in: number
			}

			expect(body.access_token).toBe('at_test123')

			expect(body.token_type).toBe('bearer')

			expect(body.expires_in).toBe(3600)

			const cookie = getCookieFromResponse(res)

			expect(cookie).toBeDefined()
		})

		it('passes email and password to authenticateUser', async () => {
			mockAuthenticateUser.mockResolvedValueOnce({
				access_token: 'at_test123',
				refresh_token: 'rt_test123',
				token_type: 'bearer',
				expires_in: 3600,
			})

			await app.request('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'test@example.com', password: 'secret' }),
			})

			expect(mockAuthenticateUser).toHaveBeenCalledWith(
				'test@example.com',
				'secret',
				expect.any(String),
			)
		})

		it('returns 401 on invalid credentials', async () => {
			mockAuthenticateUser.mockRejectedValueOnce(
				new MockAuthError('invalid_credentials', 'Incorrect email or password'),
			)

			const res = await app.request('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
			})

			expect(res.status).toBe(401)
		})

		it('returns 403 when account is inactive', async () => {
			mockAuthenticateUser.mockRejectedValueOnce(
				new MockAuthError('account_inactive', 'Account is inactive'),
			)

			const res = await app.request('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
			})

			expect(res.status).toBe(403)
		})
	})

	describe('POST /auth/logout', () => {
		it('clears the session cookie', async () => {
			const res = await app.request('/auth/logout', { method: 'POST' })

			expect(res.status).toBe(200)

			const body = (await res.json()) as { message: string }

			expect(body.message).toBe('Logged out')

			const setCookie = res.headers.get('set-cookie')

			expect(setCookie).toContain('bifrost_session=')
		})
	})

	describe('GET /auth/session', () => {
		it('returns 401 when no session cookie exists', async () => {
			const res = await app.request('/auth/session')

			expect(res.status).toBe(401)
		})

		it('returns session info when a valid cookie exists', async () => {
			// First login to get a cookie
			mockAuthenticateUser.mockResolvedValueOnce({
				access_token: 'at_test123',
				refresh_token: 'rt_test123',
				token_type: 'bearer',
				expires_in: 3600,
			})

			const loginRes = await app.request('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
			})

			const cookie = getCookieFromResponse(loginRes)

			expect(cookie).toBeDefined()

			// Use cookie to check session
			const sessionRes = await app.request('/auth/session', {
				headers: { Cookie: `bifrost_session=${cookie}` },
			})

			expect(sessionRes.status).toBe(200)

			const body = (await sessionRes.json()) as { authenticated: boolean; expiresAt: number }

			expect(body.authenticated).toBe(true)

			expect(body.expiresAt).toBeTypeOf('number')
		})
	})

	describe('POST /auth/register', () => {
		it('registers a new user and returns 201', async () => {
			mockRegisterNewUser.mockResolvedValueOnce({
				id: 'user-123',
				email: 'new@example.com',
				is_active: true,
				is_verified: false,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})

			const res = await app.request('/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'new@example.com', password: 'password123' }),
			})

			expect(res.status).toBe(201)

			const body = (await res.json()) as { id: string; email: string }

			expect(body.id).toBe('user-123')

			expect(body.email).toBe('new@example.com')
		})

		it('returns 409 when email already exists', async () => {
			mockRegisterNewUser.mockRejectedValueOnce(
				new MockAuthError('email_exists', 'Email already registered'),
			)

			const res = await app.request('/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'existing@example.com', password: 'password123' }),
			})

			expect(res.status).toBe(409)
		})
	})
})
