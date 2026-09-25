import { stubServiceEnv } from 'vali/env'

const API_KEY = 'test-vidar-api-key-that-is-at-least-32-chars'

stubServiceEnv({ VIDAR_API_KEY: API_KEY })

const { mockListEvents, mockSetThreatResolved } = vi.hoisted(() => ({
	mockListEvents: vi.fn(),
	mockSetThreatResolved: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
	db: { ping: vi.fn().mockResolvedValue(true) },
	closePool: vi.fn(),
}))

vi.mock('../handlers/events.js', () => ({
	ingestEvent: vi.fn(),
	listEvents: (...args: unknown[]) => mockListEvents(...args),
}))

vi.mock('../handlers/threats.js', () => ({
	listThreats: vi.fn(),
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
		const res = await app.request('/vidar/events')

		expect(res.status).toBe(401)
	})

	it('rejects requests with the wrong key', async () => {
		const res = await app.request('/vidar/events', {
			headers: { Authorization: 'Bearer wrong-key' },
		})

		expect(res.status).toBe(401)
	})

	it('leaves health open', async () => {
		const res = await app.request('/vidar/health')

		expect(res.status).toBe(200)
	})
})

describe('GET /vidar/events', () => {
	it('passes filters through and defaults the limit', async () => {
		mockListEvents.mockResolvedValue({ data: [], total: 0 })

		const res = await app.request('/vidar/events?ip=203.0.113.42&event_type=login_failed', {
			headers: auth,
		})

		expect(res.status).toBe(200)

		expect(mockListEvents).toHaveBeenCalledWith({
			ip: '203.0.113.42',
			event_type: 'login_failed',
			limit: 100,
		})
	})

	it('rejects a limit above the maximum', async () => {
		const res = await app.request('/vidar/events?limit=501', { headers: auth })

		expect(res.status).toBe(400)

		expect(mockListEvents).not.toHaveBeenCalled()
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
