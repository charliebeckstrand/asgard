import { createHermesApp } from '@/app'

const mockPublishResponse = {
	id: '123',
	topic: 'user.registered',
	payload: {},
	source: 'test',
	created_at: '2026-01-01T00:00:00Z',
}

const mockSubscriptionsResponse = {
	data: [
		{
			id: '456',
			topic: 'user.registered',
			callback_url: 'http://localhost:3000/webhook',
			service: 'bifrost',
			is_active: true,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-01T00:00:00Z',
		},
	],
	total: 1,
}

const originalFetch = global.fetch

beforeAll(() => {
	global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
		const path = new URL(url).pathname
		const method = (init?.method ?? 'GET').toUpperCase()

		if (path === '/events/publish' && method === 'POST') {
			return Promise.resolve(
				new Response(JSON.stringify(mockPublishResponse), {
					status: 202,
					headers: { 'Content-Type': 'application/json' },
				}),
			)
		}

		if (path === '/events/subscriptions' && method === 'GET') {
			return Promise.resolve(
				new Response(JSON.stringify(mockSubscriptionsResponse), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}),
			)
		}

		if (path === '/events/subscriptions' && method === 'POST') {
			return Promise.resolve(
				new Response(JSON.stringify(mockSubscriptionsResponse.data[0]), {
					status: 201,
					headers: { 'Content-Type': 'application/json' },
				}),
			)
		}

		if (path.startsWith('/events/subscriptions/') && method === 'DELETE') {
			return Promise.resolve(
				new Response(JSON.stringify({ message: 'Subscription deleted' }), {
					status: 200,
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

describe('events routes', () => {
	const app = createHermesApp()

	it('publishes an event via Huginn', async () => {
		const res = await app.request('/rpc/events/publish', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				topic: 'user.registered',
				payload: { userId: '1' },
				source: 'test',
			}),
		})

		expect(res.status).toBe(202)

		const data = await res.json()

		expect(data.id).toBe('123')
		expect(data.topic).toBe('user.registered')
	})

	it('lists subscriptions via Huginn', async () => {
		const res = await app.request('/rpc/events/subscriptions')

		expect(res.status).toBe(200)

		const data = await res.json()

		expect(data.total).toBe(1)
		expect(data.data[0].topic).toBe('user.registered')
	})

	it('creates a subscription via Huginn', async () => {
		const res = await app.request('/rpc/events/subscriptions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				topic: 'user.registered',
				callback_url: 'http://localhost:3000/webhook',
				service: 'bifrost',
			}),
		})

		expect(res.status).toBe(201)

		const data = await res.json()

		expect(data.topic).toBe('user.registered')
	})

	it('deletes a subscription via Huginn', async () => {
		const res = await app.request('/rpc/events/subscriptions/456', {
			method: 'DELETE',
		})

		expect(res.status).toBe(200)

		const data = await res.json()

		expect(data.message).toBe('Subscription deleted')
	})
})
