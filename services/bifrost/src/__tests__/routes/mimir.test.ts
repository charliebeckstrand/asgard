import { stubServiceEnv } from 'vali/env'

const MIMIR_URL = 'http://mimir.internal:8000'

const MIMIR_API_KEY = 'test-mimir-api-key-that-is-at-least-32-chars'

stubServiceEnv({ MIMIR_URL, MIMIR_API_KEY })

vi.mock('../../auth/index.js', { spy: true })

vi.mock('vidar/client', () => ({
	configure: vi.fn(),
	banCheck: vi.fn().mockReturnValue(async (_c: unknown, next: () => Promise<void>) => {
		await next()
	}),
	reportEvent: vi.fn(),
}))

vi.mock('../../lib/db.js', () => ({
	db: { ping: vi.fn().mockResolvedValue(true) },
}))

import type { User } from 'skuld'
import { createBifrostApp } from '../../app.js'
import * as auth from '../../auth/index.js'

const mockFindSession = vi.mocked(auth.findSession)

const ORIGIN = 'http://localhost:3000'

const app = createBifrostApp()

const user: User = {
	id: '00000000-0000-4000-8000-000000000001',
	email: 'user@example.com',
	name: null,
	is_active: true,
	is_verified: true,
	roles: ['user'],
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
}

const headers = {
	'Content-Type': 'application/json',
	Cookie: '__Host-session=token',
	Origin: ORIGIN,
}

const fetchMock = vi.fn()

beforeEach(() => {
	vi.resetAllMocks()

	vi.stubGlobal('fetch', fetchMock)

	mockFindSession.mockResolvedValue({
		id: 'session-hash',
		created_at: '2026-09-26T00:00:00.000Z',
		expires_at: '2026-10-26T00:00:00.000Z',
		two_step: false,
		user,
	})

	fetchMock.mockResolvedValue(
		Response.json([], { headers: { 'cache-control': 'private, no-store', 'set-cookie': 'x=1' } }),
	)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('Mimir routes', () => {
	it.each([
		['GET', '/api/places'],
		['POST', '/api/places'],
		['PUT', '/api/places/abc'],
		['DELETE', '/api/places/abc'],
		['GET', '/api/visits'],
		['PUT', '/api/visits/states/Ohio'],
		['GET', '/api/trips'],
		['POST', '/api/trips'],
		['PUT', '/api/trips/abc'],
		['DELETE', '/api/trips/abc'],
		['POST', '/api/photos/uploads'],
		['GET', '/api/predictions/2026'],
		['PUT', '/api/predictions/2026/5'],
		['DELETE', '/api/predictions/2026/5'],
		['GET', '/api/games/numbers/stats?today=20261116'],
		['POST', '/api/games/numbers/results'],
	])('forwards %s %s to the same path on Mimir', async (method, path) => {
		await app.request(path, { method, headers, body: method === 'GET' ? undefined : '{}' })

		expect(fetchMock).toHaveBeenCalledWith(
			`${MIMIR_URL}${path}`,
			expect.objectContaining({ method }),
		)
	})

	it('sends the API key and the signed-in user', async () => {
		await app.request('/api/places', { headers })

		const init = fetchMock.mock.calls[0][1] as RequestInit

		const sent = init.headers as Record<string, string>

		expect(sent.authorization).toBe(`Bearer ${MIMIR_API_KEY}`)

		expect(JSON.parse(sent['x-mimir-user'])).toEqual({
			id: user.id,
			name: null,
			roles: ['user'],
			is_verified: true,
		})
	})

	it('keeps the query and the body', async () => {
		await app.request('/api/places?sort=name', {
			method: 'POST',
			headers,
			body: JSON.stringify({ name: 'Cafe' }),
		})

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

		expect(url).toBe(`${MIMIR_URL}/api/places?sort=name`)

		expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"name":"Cafe"}')

		expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
	})

	it("passes Mimir's answer through without its cookies", async () => {
		fetchMock.mockResolvedValue(
			Response.json(
				{ error: 'Conflict', message: 'Full', statusCode: 409 },
				{ status: 409, headers: { 'set-cookie': 'x=1', 'cache-control': 'private, no-store' } },
			),
		)

		const res = await app.request('/api/places', { method: 'POST', headers, body: '{}' })

		expect(res.status).toBe(409)

		expect(await res.json()).toMatchObject({ message: 'Full' })

		expect(res.headers.get('cache-control')).toBe('private, no-store')

		expect(res.headers.get('set-cookie')).toBeNull()
	})

	it('returns 401 without a session and never calls Mimir', async () => {
		mockFindSession.mockResolvedValue(null)

		const res = await app.request('/api/places', { headers })

		expect(res.status).toBe(401)

		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('forwards the leaderboard of a daily puzzle with no user and no session', async () => {
		mockFindSession.mockResolvedValue(null)

		const path = '/api/games/numbers/daily?date=20261116&mode=solo'

		const res = await app.request(path, { headers })

		expect(res.status).toBe(200)

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

		expect(url).toBe(`${MIMIR_URL}${path}`)

		const sent = init.headers as Record<string, string>

		expect(sent.authorization).toBe(`Bearer ${MIMIR_API_KEY}`)

		expect(sent['x-mimir-user']).toBeUndefined()
	})

	it('forwards the leaderboard of a daily puzzle with the signed-in user', async () => {
		await app.request('/api/games/numbers/daily?date=20261116&mode=solo', { headers })

		const init = fetchMock.mock.calls[0][1] as RequestInit

		const sent = init.headers as Record<string, string>

		expect(JSON.parse(sent['x-mimir-user'])).toMatchObject({ id: user.id })
	})

	it.each([
		['GET', '/api/games/numbers/stats?today=20261116'],
		['POST', '/api/games/numbers/results'],
	])('returns 401 for %s %s without a session and never calls Mimir', async (method, path) => {
		mockFindSession.mockResolvedValue(null)

		const res = await app.request(path, {
			method,
			headers,
			body: method === 'GET' ? undefined : '{}',
		})

		expect(res.status).toBe(401)

		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('returns 503 when Mimir is unreachable', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'))

		const res = await app.request('/api/places', { headers })

		expect(res.status).toBe(503)
	})

	it.each([401, 500])('returns 503 when Mimir answers %i', async (status) => {
		fetchMock.mockResolvedValue(new Response(null, { status }))

		const res = await app.request('/api/visits', { headers })

		expect(res.status).toBe(503)
	})

	it('leaves other paths alone', async () => {
		const res = await app.request('/api/placesx', { headers })

		expect(res.status).toBe(404)

		expect(fetchMock).not.toHaveBeenCalled()
	})
})
