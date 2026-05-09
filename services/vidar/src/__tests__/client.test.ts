import { Hono } from 'hono'
import { configure, createVidar, reportEvent } from '@/client'

const VIDAR_URL = 'http://vidar.test'

function makeApp() {
	const app = new Hono()

	app.use('*', createVidar({ rate: 100, burst: 100, route: '/test', service: 'unit' }))

	app.get('/test', (c) => c.text('OK'))

	return app
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
	fetchMock = vi.fn()

	vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('createVidar middleware', () => {
	describe('when unconfigured (no vidarUrl)', () => {
		beforeEach(() => {
			configure({})
		})

		it('passes the request through without calling fetch', async () => {
			const app = makeApp()

			const res = await app.request('/test')

			expect(res.status).toBe(200)

			expect(fetchMock).not.toHaveBeenCalled()
		})

		it('still applies local rate limiting', async () => {
			const app = new Hono()

			app.use('*', createVidar({ rate: 0, burst: 1, service: 'unit' }))

			app.get('/x', (c) => c.text('OK'))

			const ok = await app.request('/x')

			expect(ok.status).toBe(200)

			const denied = await app.request('/x')

			expect(denied.status).toBe(429)
		})
	})

	describe('when configured', () => {
		beforeEach(() => {
			configure({ vidarUrl: VIDAR_URL })
		})

		it('blocks the request with 403 when Vidar reports banned', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ banned: true, reason: 'brute-force' }))

			const res = await makeApp().request('/test')

			expect(res.status).toBe(403)
		})

		it('proceeds when Vidar reports not-banned', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ banned: false }))

			const res = await makeApp().request('/test')

			expect(res.status).toBe(200)
		})

		it('fails open (proceeds) on Vidar 5xx', async () => {
			fetchMock.mockResolvedValueOnce(new Response('boom', { status: 503 }))

			const res = await makeApp().request('/test')

			expect(res.status).toBe(200)
		})

		it('fails open on Vidar network error', async () => {
			fetchMock.mockRejectedValueOnce(new TypeError('connect ECONNREFUSED'))

			const res = await makeApp().request('/test')

			expect(res.status).toBe(200)
		})

		it('fails open on schema-invalid Vidar response', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: 'shape' }))

			const res = await makeApp().request('/test')

			expect(res.status).toBe(200)
		})

		it('opens the circuit after repeated 5xx responses', async () => {
			const app = makeApp()

			for (let i = 0; i < 6; i++) {
				fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }))

				await app.request('/test')
			}

			const callsBefore = fetchMock.mock.calls.length

			// Once the breaker is open, subsequent requests must NOT hit fetch
			// (the breaker short-circuits to fail-open).
			await app.request('/test')

			expect(fetchMock.mock.calls.length).toBe(callsBefore)
		})
	})

	describe('rate limiting + reportEvent', () => {
		beforeEach(() => {
			configure({ vidarUrl: VIDAR_URL })
		})

		it('returns 429 and reports rate_limited when bucket is empty', async () => {
			fetchMock.mockResolvedValue(jsonResponse({ banned: false }))

			const app = new Hono()

			app.use('*', createVidar({ rate: 0, burst: 1, route: '/test', service: 'unit' }))

			app.get('/test', (c) => c.text('OK'))

			await app.request('/test')

			const blocked = await app.request('/test')

			expect(blocked.status).toBe(429)

			// Fire-and-forget reportEvent eventually hits /vidar/events.
			await vi.waitFor(() => {
				expect(
					fetchMock.mock.calls.find(([url]) => String(url).includes('/vidar/events')),
				).toBeDefined()
			})
		})
	})
})

describe('reportEvent', () => {
	beforeEach(() => {
		configure({ vidarUrl: VIDAR_URL })
	})

	it('does not throw on failure', () => {
		fetchMock.mockRejectedValueOnce(new TypeError('network down'))

		expect(() => reportEvent('login_failed', '1.2.3.4')).not.toThrow()
	})

	it('does not throw when Vidar is unconfigured', () => {
		configure({})

		expect(() => reportEvent('login_failed', '1.2.3.4')).not.toThrow()

		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('posts the event payload to /vidar/events', async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))

		reportEvent('login_failed', '1.2.3.4', { user_id: 'u1' }, 'bifrost')

		const call = await vi.waitFor(() => {
			const found = fetchMock.mock.calls.find(([url]) => String(url).includes('/vidar/events'))

			expect(found).toBeDefined()

			return found as [unknown, RequestInit]
		})

		const [, init] = call

		expect(init.method).toBe('POST')

		const body = JSON.parse(init.body as string) as Record<string, unknown>

		expect(body).toEqual({
			ip: '1.2.3.4',
			event_type: 'login_failed',
			details: { user_id: 'u1' },
			service: 'bifrost',
		})
	})
})
