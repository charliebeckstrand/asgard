import { extractCookie } from 'vali/auth'
import { stubServiceEnv, TEST_SESSION_SECRET } from 'vali/env'

stubServiceEnv()

const { mockUserRepository, mockRegisterUser } = vi.hoisted(() => ({
	mockUserRepository: {
		getUsers: vi.fn(),
		getUserById: vi.fn(),
		updateUser: vi.fn(),
		deleteUser: vi.fn(),
		insertUser: vi.fn(),
		getCredentialsByEmail: vi.fn(),
	},
	mockRegisterUser: vi.fn(),
}))

import { AuthError } from '../../auth/errors.js'

vi.mock('../../auth/index.js', async () => {
	const errors =
		await vi.importActual<typeof import('../../auth/errors.js')>('../../auth/errors.js')

	return {
		configure: vi.fn(),
		getConfig: () => ({ userRepository: mockUserRepository }),
		registerUser: (...args: unknown[]) => mockRegisterUser(...args),
		AuthError: errors.AuthError,
		authenticateUser: vi.fn(),
		refreshTokenPair: vi.fn(),
	}
})

vi.mock('../../auth/jwt.js', () => ({
	verifyAccessToken: vi.fn(),
	ACCESS_TOKEN_TTL_SECONDS: 30 * 60,
	REFRESH_TOKEN_TTL_SECONDS: 7 * 24 * 60 * 60,
}))

vi.mock('vidar/client', () => ({
	configure: vi.fn(),
	createVidar: vi.fn().mockReturnValue(async (_c: unknown, next: () => Promise<void>) => {
		await next()
	}),
	reportEvent: vi.fn(),
}))

vi.mock('../../lib/db.js', () => ({
	db: { ping: vi.fn().mockResolvedValue(true) },
	closePool: vi.fn(),
}))

import { createBifrostApp } from '../../app.js'
import { _encodeSession, type SessionData } from '../../middleware/session.js'

const ORIGIN = 'http://localhost:3000'

const app = createBifrostApp()

async function withSession(
	overrides: Partial<SessionData> = {},
): Promise<{ Cookie: string; Origin: string }> {
	const sessionData: SessionData = {
		accessToken: 'at_test',
		refreshToken: 'rt_test',
		expiresAt: Math.floor(Date.now() / 1000) + 3600,
		...overrides,
	}

	const cookie = await _encodeSession(sessionData, TEST_SESSION_SECRET)

	return { Cookie: `bifrost_session=${cookie}`, Origin: ORIGIN }
}

const VALID_ID = '00000000-0000-4000-8000-000000000001'

const sampleUser = {
	id: VALID_ID,
	email: 'user@example.com',
	is_active: true,
	is_verified: false,
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
}

describe('Users routes', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('authentication gate', () => {
		it.each([
			['GET', '/api/users'],
			['GET', `/api/users/${VALID_ID}`],
			['PUT', `/api/users/${VALID_ID}`],
			['DELETE', `/api/users/${VALID_ID}`],
			['POST', '/api/users'],
		] as const)('returns 401 for %s %s without a session', async (method, path) => {
			const res = await app.request(path, {
				method,
				headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
				body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({}),
			})

			expect(res.status).toBe(401)
		})
	})

	describe('GET /api/users', () => {
		it('returns the list wrapped in toList shape', async () => {
			mockUserRepository.getUsers.mockResolvedValueOnce([sampleUser])

			const res = await app.request('/api/users', {
				headers: await withSession(),
			})

			expect(res.status).toBe(200)

			const body = (await res.json()) as { data: (typeof sampleUser)[]; total: number }

			expect(body.total).toBe(1)

			expect(body.data).toEqual([sampleUser])
		})
	})

	describe('GET /api/users/:id', () => {
		it('returns the user when found', async () => {
			mockUserRepository.getUserById.mockResolvedValueOnce(sampleUser)

			const res = await app.request(`/api/users/${VALID_ID}`, {
				headers: await withSession(),
			})

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(sampleUser)

			expect(mockUserRepository.getUserById).toHaveBeenCalledWith(VALID_ID)
		})

		it('returns 404 when not found', async () => {
			mockUserRepository.getUserById.mockResolvedValueOnce(null)

			const res = await app.request(`/api/users/${VALID_ID}`, {
				headers: await withSession(),
			})

			expect(res.status).toBe(404)
		})

		it('returns 400 for non-uuid id', async () => {
			const res = await app.request('/api/users/not-a-uuid', {
				headers: await withSession(),
			})

			expect(res.status).toBe(400)

			expect(mockUserRepository.getUserById).not.toHaveBeenCalled()
		})
	})

	describe('POST /api/users', () => {
		it('creates a user and returns 201', async () => {
			mockRegisterUser.mockResolvedValueOnce(sampleUser)

			const res = await app.request('/api/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...(await withSession()) },
				body: JSON.stringify({ email: 'new@example.com', password: 'password1234' }),
			})

			expect(res.status).toBe(201)

			const body = (await res.json()) as { id: string; email: string }

			expect(body).toEqual({ id: sampleUser.id, email: sampleUser.email })

			expect(mockRegisterUser).toHaveBeenCalledWith(
				'new@example.com',
				'password1234',
				expect.any(String),
			)
		})

		it('returns 409 when registerUser reports email_exists', async () => {
			mockRegisterUser.mockRejectedValueOnce(
				new AuthError('email_exists', 'Email already registered'),
			)

			const res = await app.request('/api/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...(await withSession()) },
				body: JSON.stringify({ email: 'dup@example.com', password: 'password1234' }),
			})

			expect(res.status).toBe(409)
		})

		it('returns 400 for invalid email', async () => {
			const res = await app.request('/api/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...(await withSession()) },
				body: JSON.stringify({ email: 'not-an-email', password: 'password1234' }),
			})

			expect(res.status).toBe(400)

			expect(mockRegisterUser).not.toHaveBeenCalled()
		})
	})

	describe('PUT /api/users/:id', () => {
		it('updates and returns the user', async () => {
			const updated = { ...sampleUser, is_active: false }

			mockUserRepository.updateUser.mockResolvedValueOnce(updated)

			const res = await app.request(`/api/users/${VALID_ID}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...(await withSession()) },
				body: JSON.stringify({ is_active: false }),
			})

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(updated)

			expect(mockUserRepository.updateUser).toHaveBeenCalledWith(VALID_ID, { is_active: false })
		})

		it('returns 404 when the user is missing', async () => {
			mockUserRepository.updateUser.mockResolvedValueOnce(null)

			const res = await app.request(`/api/users/${VALID_ID}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...(await withSession()) },
				body: JSON.stringify({ is_active: false }),
			})

			expect(res.status).toBe(404)
		})

		it('returns 400 for invalid email override', async () => {
			const res = await app.request(`/api/users/${VALID_ID}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...(await withSession()) },
				body: JSON.stringify({ email: 'not-an-email' }),
			})

			expect(res.status).toBe(400)

			expect(mockUserRepository.updateUser).not.toHaveBeenCalled()
		})
	})

	describe('DELETE /api/users/:id', () => {
		it('returns 204 on successful delete', async () => {
			mockUserRepository.deleteUser.mockResolvedValueOnce(true)

			const res = await app.request(`/api/users/${VALID_ID}`, {
				method: 'DELETE',
				headers: await withSession(),
			})

			expect(res.status).toBe(204)

			expect(mockUserRepository.deleteUser).toHaveBeenCalledWith(VALID_ID)
		})

		it('returns 404 when the user does not exist', async () => {
			mockUserRepository.deleteUser.mockResolvedValueOnce(false)

			const res = await app.request(`/api/users/${VALID_ID}`, {
				method: 'DELETE',
				headers: await withSession(),
			})

			expect(res.status).toBe(404)
		})
	})

	describe('cookie helper sanity', () => {
		it('extractCookie pulls the value from a Set-Cookie header', () => {
			const fake = new Response(null, {
				headers: { 'Set-Cookie': 'bifrost_session=abc123; Path=/; HttpOnly' },
			})

			expect(extractCookie(fake, 'bifrost_session')).toBe('abc123')

			expect(extractCookie(fake, 'missing')).toBeUndefined()
		})
	})
})
