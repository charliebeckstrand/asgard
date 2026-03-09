import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_SECRET = 'test-secret-that-is-at-least-32-chars-long'

vi.stubEnv('SESSION_SECRET', MOCK_SECRET)
vi.stubEnv('HEIMDALL_URL', 'http://heimdall:8000')
vi.stubEnv('HEIMDALL_API_KEY', 'test-api-key')

const mockFetch = vi.fn()

vi.stubGlobal('fetch', mockFetch)

import { createApp } from '../app.js'

const app = createApp()

function heimdallTokenResponse(overrides?: Partial<Record<string, unknown>>) {
	return {
		access_token: 'at_test123',
		refresh_token: 'rt_test123',
		token_type: 'bearer',
		expires_in: 3600,
		...overrides,
	}
}

function getCookieFromResponse(res: Response): string | undefined {
	const setCookie = res.headers.get('set-cookie')
	if (!setCookie) return undefined

	const match = setCookie.match(/bifrost_session=([^;]+)/)
	return match?.[1]
}

describe('Auth routes', () => {
	beforeEach(() => {
		mockFetch.mockReset()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('POST /auth/login', () => {
		it('returns 200 and sets session cookie on successful login', async () => {
			mockFetch.mockResolvedValueOnce(
				new Response(JSON.stringify(heimdallTokenResponse()), { status: 200 }),
			)

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

		it('forwards credentials to Heimdall', async () => {
			mockFetch.mockResolvedValueOnce(
				new Response(JSON.stringify(heimdallTokenResponse()), { status: 200 }),
			)

			await app.request('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'test@example.com', password: 'secret' }),
			})

			expect(mockFetch).toHaveBeenCalledWith(
				'http://heimdall:8000/auth/login',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ email: 'test@example.com', password: 'secret' }),
				}),
			)
		})

		it('returns 401 on invalid credentials', async () => {
			mockFetch.mockResolvedValueOnce(
				new Response(JSON.stringify({ detail: 'Incorrect email or password' }), { status: 401 }),
			)

			const res = await app.request('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
			})

			expect(res.status).toBe(401)
		})

		it('returns 502 when Heimdall is unreachable', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

			const res = await app.request('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
			})

			expect(res.status).toBe(502)
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
			mockFetch.mockResolvedValueOnce(
				new Response(JSON.stringify(heimdallTokenResponse()), { status: 200 }),
			)

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
		it('proxies registration to Heimdall and returns 201', async () => {
			mockFetch.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'user-123', email: 'new@example.com' }), { status: 201 }),
			)

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
			mockFetch.mockResolvedValueOnce(
				new Response(JSON.stringify({ detail: 'Email already registered' }), { status: 409 }),
			)

			const res = await app.request('/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'existing@example.com', password: 'password123' }),
			})

			expect(res.status).toBe(409)
		})

		it('returns 502 when Heimdall is unreachable', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

			const res = await app.request('/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'new@example.com', password: 'password123' }),
			})

			expect(res.status).toBe(502)
		})
	})
})
