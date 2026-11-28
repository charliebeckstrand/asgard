import { stubServiceEnv } from 'vali/env'

const API_KEY = 'test-vidar-api-key-that-is-at-least-32-chars'

stubServiceEnv({ VIDAR_API_KEY: API_KEY })

const { mockListThreats, mockSetThreatResolved, mockRemoveBan, mockPing } = vi.hoisted(() => ({
	mockListThreats: vi.fn(),
	mockSetThreatResolved: vi.fn(),
	mockRemoveBan: vi.fn(),
	mockPing: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
	db: { ping: mockPing },
}))

vi.mock('../handlers/events.js', () => ({
	ingestEvent: vi.fn(),
}))

vi.mock('../handlers/bans.js', () => ({
	isIpBanned: vi.fn(),
	listActiveBans: vi.fn(),
	removeBan: (...args: unknown[]) => mockRemoveBan(...args),
}))

vi.mock('../handlers/threats.js', () => ({
	listThreats: (...args: unknown[]) => mockListThreats(...args),
	setThreatResolved: (...args: unknown[]) => mockSetThreatResolved(...args),
}))

import { createVidarApp } from '@/app'

const app = createVidarApp()

const auth = { Authorization: `Bearer ${API_KEY}` }

const THREAT_ID = '550e8400-e29b-41d4-a716-446655440000'

beforeEach(() => {
	vi.clearAllMocks()
})

describe('api key auth', () => {
	it('rejects requests without the key', async () => {
		const res = await app.request('/vidar/threats')

		expect(res.status).toBe(401)
	})

	it('rejects requests with the wrong key', async () => {
		const res = await app.request('/vidar/threats', {
			headers: { Authorization: 'Bearer wrong-key' },
		})

		expect(res.status).toBe(401)
	})

	it('leaves health open', async () => {
		mockPing.mockResolvedValue(true)

		const res = await app.request('/vidar/health')

		expect(res.status).toBe(200)
	})
})

describe('GET /vidar/health', () => {
	it('reports unhealthy when the database is down', async () => {
		mockPing.mockResolvedValue(false)

		const res = await app.request('/vidar/health')

		expect(res.status).toBe(503)
	})
})

describe('PATCH /vidar/threats/:id', () => {
	function patch(id: string, body: unknown) {
		return app.request(`/vidar/threats/${id}`, {
			method: 'PATCH',
			headers: { ...auth, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
	}

	it('returns the updated threat', async () => {
		mockSetThreatResolved.mockResolvedValue({
			id: THREAT_ID,
			threat_type: 'brute_force',
			severity: 'medium',
			ip: '203.0.113.42',
			details: {},
			action_taken: 'Banned for 1h',
			resolved: true,
			created_at: '2026-09-25T12:00:00.000Z',
		})

		const res = await patch(THREAT_ID, { resolved: true })

		expect(res.status).toBe(200)

		expect(mockSetThreatResolved).toHaveBeenCalledWith(THREAT_ID, true)
	})

	it('returns 404 when the threat does not exist', async () => {
		mockSetThreatResolved.mockResolvedValue(null)

		const res = await patch(THREAT_ID, { resolved: true })

		expect(res.status).toBe(404)
	})

	it('rejects an id that is not a UUID', async () => {
		const res = await patch('not-a-uuid', { resolved: true })

		expect(res.status).toBe(400)

		expect(mockSetThreatResolved).not.toHaveBeenCalled()
	})
})

describe('GET /vidar/threats', () => {
	it('reads the resolved filter as a boolean', async () => {
		mockListThreats.mockResolvedValue({ data: [], total: 0 })

		const res = await app.request('/vidar/threats?resolved=false', { headers: auth })

		expect(res.status).toBe(200)

		expect(mockListThreats).toHaveBeenCalledWith({ resolved: false })
	})
})

describe('address validation', () => {
	it.each([
		['GET', '/vidar/check-ip?ip=not-an-ip', undefined],
		['POST', '/vidar/events', { ip: 'not-an-ip', event_type: 'login_failed', service: 'bifrost' }],
		['DELETE', '/vidar/bans/not-an-ip', undefined],
	])('rejects a bad address on %s %s', async (method, path, body) => {
		const res = await app.request(path, {
			method,
			headers: { ...auth, 'Content-Type': 'application/json' },
			body: body && JSON.stringify(body),
		})

		expect(res.status).toBe(400)
	})
})

describe('DELETE /vidar/bans/:ip', () => {
	it('answers 404 when no ban is in force', async () => {
		mockRemoveBan.mockResolvedValue(false)

		const res = await app.request('/vidar/bans/203.0.113.42', { method: 'DELETE', headers: auth })

		expect(res.status).toBe(404)

		expect(mockRemoveBan).toHaveBeenCalledWith('203.0.113.42')
	})
})
