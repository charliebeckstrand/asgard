import { HTTPException } from 'hono/http-exception'
import { stubServiceEnv } from 'vali/env'

stubServiceEnv()

const { mockFindSession, mockListThreats, mockResolveThreat, mockListBans, mockRemoveBan } =
	vi.hoisted(() => ({
		mockFindSession: vi.fn(),
		mockListThreats: vi.fn(),
		mockResolveThreat: vi.fn(),
		mockListBans: vi.fn(),
		mockRemoveBan: vi.fn(),
	}))

vi.mock('../../auth/index.js', async () => {
	const errors =
		await vi.importActual<typeof import('../../auth/errors.js')>('../../auth/errors.js')

	return {
		configure: vi.fn(),
		getConfig: () => ({}),
		AuthError: errors.AuthError,
		SESSION_TTL_SECONDS: 30 * 24 * 60 * 60,
		findSession: (...args: unknown[]) => mockFindSession(...args),
	}
})

vi.mock('vidar/client', () => ({
	configure: vi.fn(),
	banCheck: vi.fn().mockReturnValue(async (_c: unknown, next: () => Promise<void>) => {
		await next()
	}),
	reportEvent: vi.fn(),
	listThreats: (...args: unknown[]) => mockListThreats(...args),
	resolveThreat: (...args: unknown[]) => mockResolveThreat(...args),
	listBans: (...args: unknown[]) => mockListBans(...args),
	removeBan: (...args: unknown[]) => mockRemoveBan(...args),
}))

vi.mock('../../lib/db.js', () => ({
	db: { ping: vi.fn().mockResolvedValue(true) },
}))

import { createBifrostApp } from '../../app.js'

const ORIGIN = 'http://localhost:3000'

const app = createBifrostApp()

const THREAT_ID = '00000000-0000-4000-8000-000000000003'

const sampleUser = {
	id: '00000000-0000-4000-8000-000000000001',
	email: 'user@example.com',
	name: null,
	is_active: true,
	is_verified: true,
	roles: ['user'],
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
}

const sampleAdmin = {
	...sampleUser,
	id: '00000000-0000-4000-8000-000000000002',
	roles: ['user', 'admin'],
}

const sampleThreat = {
	id: THREAT_ID,
	threat_type: 'brute_force',
	severity: 'medium',
	ip: '203.0.113.7',
	details: { rule_id: 'brute_force' },
	action_taken: 'Banned for 1h',
	resolved: false,
	created_at: '2026-09-27T00:00:00.000Z',
}

function signedInAs(user: typeof sampleUser, { twoStep = true } = {}) {
	mockFindSession.mockResolvedValue({
		id: 'session-hash',
		created_at: '2026-09-26T00:00:00.000Z',
		expires_at: '2026-10-26T00:00:00.000Z',
		two_step: twoStep,
		user,
	})
}

const headers = {
	'Content-Type': 'application/json',
	Cookie: '__Host-session=token',
	Origin: ORIGIN,
}

const routes = [
	['GET', '/api/security/threats'],
	['PATCH', `/api/security/threats/${THREAT_ID}`],
	['GET', '/api/security/bans'],
	['DELETE', '/api/security/bans/203.0.113.7'],
] as const

function send(method: string, path: string) {
	return app.request(path, {
		method,
		headers,
		body: method === 'PATCH' ? JSON.stringify({ resolved: true }) : undefined,
	})
}

describe('Security routes', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		signedInAs(sampleAdmin)
	})

	describe('access', () => {
		it.each(routes)('returns 403 for %s %s when the user is not an admin', async (method, path) => {
			signedInAs(sampleUser)

			const res = await send(method, path)

			expect(res.status).toBe(403)

			expect(mockListThreats).not.toHaveBeenCalled()

			expect(mockRemoveBan).not.toHaveBeenCalled()
		})

		it.each(routes)('returns 403 for %s %s before the second step', async (method, path) => {
			signedInAs(sampleAdmin, { twoStep: false })

			const res = await send(method, path)

			expect(res.status).toBe(403)

			expect(await res.json()).toMatchObject({ code: 'second_step_required' })
		})
	})

	describe('GET /api/security/threats', () => {
		it('lists threats, passing the resolved filter on', async () => {
			mockListThreats.mockResolvedValue({ data: [sampleThreat], total: 1 })

			const res = await app.request('/api/security/threats?resolved=false', { headers })

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ data: [sampleThreat], total: 1 })

			expect(mockListThreats).toHaveBeenCalledWith(false)
		})

		it('lists every threat without a filter', async () => {
			mockListThreats.mockResolvedValue({ data: [], total: 0 })

			await app.request('/api/security/threats', { headers })

			expect(mockListThreats).toHaveBeenCalledWith(undefined)
		})

		it('passes on 503 when Vidar is unavailable', async () => {
			mockListThreats.mockRejectedValue(
				new HTTPException(503, { message: 'Security monitoring is unavailable' }),
			)

			const res = await app.request('/api/security/threats', { headers })

			expect(res.status).toBe(503)
		})
	})

	describe('PATCH /api/security/threats/:id', () => {
		it('resolves the threat', async () => {
			mockResolveThreat.mockResolvedValue({ ...sampleThreat, resolved: true })

			const res = await send('PATCH', `/api/security/threats/${THREAT_ID}`)

			expect(res.status).toBe(200)

			expect(mockResolveThreat).toHaveBeenCalledWith(THREAT_ID, true)
		})

		it('returns 404 for an unknown threat', async () => {
			mockResolveThreat.mockResolvedValue(null)

			const res = await send('PATCH', `/api/security/threats/${THREAT_ID}`)

			expect(res.status).toBe(404)
		})
	})

	describe('DELETE /api/security/bans/:ip', () => {
		it('lifts the ban', async () => {
			mockRemoveBan.mockResolvedValue(true)

			const res = await send('DELETE', '/api/security/bans/203.0.113.7')

			expect(res.status).toBe(204)

			expect(mockRemoveBan).toHaveBeenCalledWith('203.0.113.7')
		})

		it('returns 404 when the address is not banned', async () => {
			mockRemoveBan.mockResolvedValue(false)

			const res = await send('DELETE', '/api/security/bans/203.0.113.7')

			expect(res.status).toBe(404)
		})

		it('rejects something that is not an address', async () => {
			const res = await send('DELETE', '/api/security/bans/not-an-ip')

			expect(res.status).toBe(400)

			expect(mockRemoveBan).not.toHaveBeenCalled()
		})
	})
})
