import { stubServiceEnv } from 'vali/env'

stubServiceEnv()

const { mockUserRepository, mockFindSession, mockDeleteUserSessions, mockGetFactors } = vi.hoisted(
	() => ({
		mockUserRepository: {
			getUsers: vi.fn(),
			getUserById: vi.fn(),
			setUserActive: vi.fn(),
			insertUser: vi.fn(),
			getCredentialsByEmail: vi.fn(),
		},
		mockFindSession: vi.fn(),
		mockDeleteUserSessions: vi.fn(),
		mockGetFactors: vi.fn(),
	}),
)

vi.mock('../../auth/index.js', () => ({
	configure: vi.fn(),
	getConfig: () => ({ userRepository: mockUserRepository }),
	SESSION_TTL_SECONDS: 30 * 24 * 60 * 60,
	findSession: (...args: unknown[]) => mockFindSession(...args),
	deleteUserSessions: (...args: unknown[]) => mockDeleteUserSessions(...args),
	getFactors: (...args: unknown[]) => mockGetFactors(...args),
	secondFactorMethods: (factors: { passkeys: number; totp: boolean }) =>
		factors.passkeys > 0 || factors.totp ? ['passkey'] : [],
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
}))

import { createBifrostApp } from '../../app.js'

const ORIGIN = 'http://localhost:3000'

const app = createBifrostApp()

const USER_ID = '00000000-0000-4000-8000-000000000001'

const ADMIN_ID = '00000000-0000-4000-8000-000000000002'

const sampleUser = {
	id: USER_ID,
	email: 'user@example.com',
	is_active: true,
	is_verified: false,
	role: 'user',
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
}

const sampleAdmin = { ...sampleUser, id: ADMIN_ID, email: 'admin@example.com', role: 'admin' }

function signedInAs(user: typeof sampleUser) {
	mockFindSession.mockResolvedValue({
		id: 'session-hash',
		created_at: '2026-09-26T00:00:00.000Z',
		expires_at: '2026-10-26T00:00:00.000Z',
		user,
	})
}

const headers = {
	'Content-Type': 'application/json',
	Cookie: '__Host-session=token',
	Origin: ORIGIN,
}

function setActive(id: string, is_active: boolean) {
	return app.request(`/api/users/${id}`, {
		method: 'PATCH',
		headers,
		body: JSON.stringify({ is_active }),
	})
}

describe('Users routes', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		signedInAs(sampleAdmin)

		mockGetFactors.mockResolvedValue({ passkeys: 1, totp: false, recovery_codes: 0 })
	})

	describe('access', () => {
		it.each([
			['GET', '/api/users'],
			['GET', `/api/users/${USER_ID}`],
			['PATCH', `/api/users/${USER_ID}`],
		] as const)('returns 401 for %s %s without a session', async (method, path) => {
			const res = await app.request(path, {
				method,
				headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
				body: method === 'GET' ? undefined : JSON.stringify({ is_active: false }),
			})

			expect(res.status).toBe(401)
		})

		it.each([
			['GET', '/api/users'],
			['GET', `/api/users/${USER_ID}`],
			['PATCH', `/api/users/${USER_ID}`],
		] as const)('returns 403 for %s %s when the user is not an admin', async (method, path) => {
			signedInAs(sampleUser)

			const res = await app.request(path, {
				method,
				headers,
				body: method === 'GET' ? undefined : JSON.stringify({ is_active: false }),
			})

			expect(res.status).toBe(403)

			expect(mockUserRepository.getUsers).not.toHaveBeenCalled()

			expect(mockUserRepository.setUserActive).not.toHaveBeenCalled()
		})

		it.each([
			['GET', '/api/users'],
			['GET', `/api/users/${USER_ID}`],
			['PATCH', `/api/users/${USER_ID}`],
		] as const)('returns 403 for %s %s when the admin has no second factor', async (method, path) => {
			mockGetFactors.mockResolvedValue({ passkeys: 0, totp: false, recovery_codes: 0 })

			const res = await app.request(path, {
				method,
				headers,
				body: method === 'GET' ? undefined : JSON.stringify({ is_active: false }),
			})

			expect(res.status).toBe(403)

			expect(await res.json()).toMatchObject({
				message: 'Add a passkey or an authenticator app to use the admin pages',
			})

			expect(mockGetFactors).toHaveBeenCalledWith(ADMIN_ID)

			expect(mockUserRepository.getUsers).not.toHaveBeenCalled()

			expect(mockUserRepository.setUserActive).not.toHaveBeenCalled()
		})

		it.each([
			['POST', '/api/users'],
			['PUT', `/api/users/${USER_ID}`],
			['DELETE', `/api/users/${USER_ID}`],
		] as const)('offers no %s %s', async (method, path) => {
			const res = await app.request(path, {
				method,
				headers,
				body: method === 'DELETE' ? undefined : JSON.stringify({}),
			})

			expect(res.status).toBe(404)
		})
	})

	describe('GET /api/users', () => {
		it('returns the list wrapped in toList shape', async () => {
			mockUserRepository.getUsers.mockResolvedValueOnce([sampleUser])

			const res = await app.request('/api/users', { headers })

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ data: [sampleUser], total: 1 })
		})
	})

	describe('GET /api/users/:id', () => {
		it('returns the user when found', async () => {
			mockUserRepository.getUserById.mockResolvedValueOnce(sampleUser)

			const res = await app.request(`/api/users/${USER_ID}`, { headers })

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(sampleUser)
		})

		it('returns 404 when not found', async () => {
			mockUserRepository.getUserById.mockResolvedValueOnce(null)

			const res = await app.request(`/api/users/${USER_ID}`, { headers })

			expect(res.status).toBe(404)
		})

		it('returns 400 for a non-uuid id', async () => {
			const res = await app.request('/api/users/not-a-uuid', { headers })

			expect(res.status).toBe(400)
		})
	})

	describe('PATCH /api/users/:id', () => {
		it('deactivates a user and signs them out everywhere', async () => {
			const updated = { ...sampleUser, is_active: false }

			mockUserRepository.getUserById.mockResolvedValueOnce(sampleUser)

			mockUserRepository.setUserActive.mockResolvedValueOnce(updated)

			const res = await setActive(USER_ID, false)

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(updated)

			expect(mockUserRepository.setUserActive).toHaveBeenCalledWith(USER_ID, false)

			expect(mockDeleteUserSessions).toHaveBeenCalledWith(USER_ID)
		})

		it('reactivates a user without touching sessions', async () => {
			mockUserRepository.getUserById.mockResolvedValueOnce({ ...sampleUser, is_active: false })

			mockUserRepository.setUserActive.mockResolvedValueOnce(sampleUser)

			const res = await setActive(USER_ID, true)

			expect(res.status).toBe(200)

			expect(mockDeleteUserSessions).not.toHaveBeenCalled()
		})

		it('refuses to change another admin', async () => {
			mockUserRepository.getUserById.mockResolvedValueOnce({
				...sampleAdmin,
				id: USER_ID,
			})

			const res = await setActive(USER_ID, false)

			expect(res.status).toBe(403)

			expect(mockUserRepository.setUserActive).not.toHaveBeenCalled()
		})

		it('refuses to change the signed-in admin', async () => {
			mockUserRepository.getUserById.mockResolvedValueOnce(sampleAdmin)

			const res = await setActive(ADMIN_ID, false)

			expect(res.status).toBe(403)

			expect(mockUserRepository.setUserActive).not.toHaveBeenCalled()
		})

		it('returns 404 when the user is missing', async () => {
			mockUserRepository.getUserById.mockResolvedValueOnce(null)

			const res = await setActive(USER_ID, false)

			expect(res.status).toBe(404)
		})

		it.each([
			['email', { email: 'new@example.com' }],
			['role', { role: 'admin' }],
			['password', { password: 'password123' }],
		])('rejects a body that only changes %s', async (_, body) => {
			const res = await app.request(`/api/users/${USER_ID}`, {
				method: 'PATCH',
				headers,
				body: JSON.stringify(body),
			})

			expect(res.status).toBe(400)

			expect(mockUserRepository.setUserActive).not.toHaveBeenCalled()
		})
	})
})
