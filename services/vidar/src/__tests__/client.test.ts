import { clientIp } from 'grid/middleware'
import { Hono } from 'hono'
import { banCheck, configure, listThreats, removeBan, reportEvent, resolveThreat } from '@/client'

const VIDAR_URL = 'http://vidar.test'

function makeApp() {
	const app = new Hono()

	app.use('*', clientIp({ header: 'do-connecting-ip' }))

	app.use('*', banCheck())

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

describe('banCheck middleware', () => {
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

		it('opens the circuit after repeated 401 responses from a wrong API key', async () => {
			const app = makeApp()

			for (let i = 0; i < 6; i++) {
				fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }))

				await app.request('/test')
			}

			const callsBefore = fetchMock.mock.calls.length

			await app.request('/test')

			expect(fetchMock.mock.calls.length).toBe(callsBefore)
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

describe('admin calls', () => {
	const threat = {
		id: '00000000-0000-4000-8000-000000000003',
		threat_type: 'brute_force',
		severity: 'medium',
		ip: '203.0.113.7',
		details: {},
		action_taken: 'Banned for 1h',
		resolved: false,
		created_at: '2026-09-27T00:00:00.000Z',
	}

	beforeEach(() => {
		configure({ vidarUrl: VIDAR_URL })
	})

	it('lists threats with the resolved filter', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ data: [threat], total: 1 }))

		const result = await listThreats(false)

		expect(result).toEqual({ data: [threat], total: 1 })

		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${VIDAR_URL}/vidar/threats?resolved=false`)
	})

	it('answers null for an unknown threat', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Not found' }, 404))

		expect(await resolveThreat(threat.id, true)).toBeNull()
	})

	it('answers false when the address is not banned', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Not found' }, 404))

		expect(await removeBan('203.0.113.7')).toBe(false)
	})

	it('fails with 503 when Vidar is unconfigured', async () => {
		configure({})

		await expect(listThreats()).rejects.toMatchObject({ status: 503 })

		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('fails with 503 when Vidar is down', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Oops' }, 500))

		await expect(listThreats()).rejects.toMatchObject({ status: 503 })
	})

	it('fails with 503 on a response it does not recognize', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ nope: true }))

		await expect(listThreats()).rejects.toMatchObject({ status: 503 })
	})
})
