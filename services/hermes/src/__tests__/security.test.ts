import { createHermesApp } from '@/app'

const mockBanListResponse = {
	data: [
		{
			id: '550e8400-e29b-41d4-a716-446655440000',
			ip: '10.0.0.1',
			reason: 'Manual ban',
			rule_id: null,
			created_by: 'manual',
			expires_at: null,
			created_at: '2026-01-01T00:00:00Z',
		},
	],
	total: 1,
}

const mockSecurityEvent = {
	id: '550e8400-e29b-41d4-a716-446655440001',
	ip: '192.168.1.100',
	event_type: 'login_failed',
	details: {},
	service: 'heimdall',
	created_at: '2026-01-01T00:00:00Z',
}

const originalFetch = global.fetch

beforeAll(() => {
	global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
		const path = new URL(url).pathname
		const method = (init?.method ?? 'GET').toUpperCase()

		if (path === '/vidar/check-ip' && method === 'GET') {
			return Promise.resolve(
				new Response(JSON.stringify({ banned: false }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}),
			)
		}

		if (path === '/vidar/bans' && method === 'GET') {
			return Promise.resolve(
				new Response(JSON.stringify(mockBanListResponse), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}),
			)
		}

		if (path === '/vidar/bans' && method === 'POST') {
			return Promise.resolve(
				new Response(JSON.stringify(mockBanListResponse.data[0]), {
					status: 201,
					headers: { 'Content-Type': 'application/json' },
				}),
			)
		}

		if (path.startsWith('/vidar/bans/') && method === 'DELETE') {
			return Promise.resolve(
				new Response(JSON.stringify({ message: 'Ban removed for IP 10.0.0.1' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}),
			)
		}

		if (path === '/vidar/events' && method === 'POST') {
			return Promise.resolve(
				new Response(JSON.stringify(mockSecurityEvent), {
					status: 201,
					headers: { 'Content-Type': 'application/json' },
				}),
			)
		}

		if (path === '/events/health' || path === '/vidar/health') {
			return Promise.resolve(
				new Response(JSON.stringify({ status: 'healthy', version: '0.1.0', uptime: 100 }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}),
			)
		}

		return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`))
	})
})

afterAll(() => {
	global.fetch = originalFetch
})

describe('security routes', () => {
	const app = createHermesApp()

	it('checks if an IP is banned via Vidar', async () => {
		const res = await app.request('/rpc/security/check-ip?ip=192.168.1.100')

		expect(res.status).toBe(200)

		const data = await res.json()

		expect(data.banned).toBe(false)
	})

	it('lists active bans via Vidar', async () => {
		const res = await app.request('/rpc/security/bans')

		expect(res.status).toBe(200)

		const data = await res.json()

		expect(data.total).toBe(1)
		expect(data.data[0].ip).toBe('10.0.0.1')
	})

	it('creates a ban via Vidar', async () => {
		const res = await app.request('/rpc/security/bans', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				ip: '10.0.0.1',
				reason: 'Manual ban',
			}),
		})

		expect(res.status).toBe(201)

		const data = await res.json()

		expect(data.ip).toBe('10.0.0.1')
	})

	it('removes a ban via Vidar', async () => {
		const res = await app.request('/rpc/security/bans/10.0.0.1', {
			method: 'DELETE',
		})

		expect(res.status).toBe(200)

		const data = await res.json()

		expect(data.message).toContain('Ban removed')
	})

	it('ingests a security event via Vidar', async () => {
		const res = await app.request('/rpc/security/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				ip: '192.168.1.100',
				event_type: 'login_failed',
				details: {},
				service: 'heimdall',
			}),
		})

		expect(res.status).toBe(201)

		const data = await res.json()

		expect(data.event_type).toBe('login_failed')
	})
})
