import { stubServiceEnv } from 'vali/env'

const API_KEY = 'test-mimir-api-key-that-is-at-least-32-chars'

stubServiceEnv({ MIMIR_API_KEY: API_KEY })

const {
	mockPing,
	mockListPlaces,
	mockAddPlace,
	mockUpdatePlace,
	mockRemovePlace,
	mockListVisits,
	mockSetVisit,
	mockDeleteDocuments,
	mockListPicks,
	mockListAllPicks,
	mockSavePicks,
	mockDeletePicks,
	mockListNumbers,
	mockReadNumbersStats,
	mockRecordNumbersResult,
	mockReadNumbersBoard,
	mockReadPlayerName,
	mockSetPlayerName,
	mockDeleteGames,
	mockListTrips,
	mockCreateTrip,
	mockUpdateTrip,
	mockRemoveTrip,
	mockUploadUrl,
	mockDeleteUserPhotos,
} = vi.hoisted(() => ({
	mockPing: vi.fn(),
	mockListPlaces: vi.fn(),
	mockAddPlace: vi.fn(),
	mockUpdatePlace: vi.fn(),
	mockRemovePlace: vi.fn(),
	mockListVisits: vi.fn(),
	mockSetVisit: vi.fn(),
	mockDeleteDocuments: vi.fn(),
	mockListPicks: vi.fn(),
	mockListAllPicks: vi.fn(),
	mockSavePicks: vi.fn(),
	mockDeletePicks: vi.fn(),
	mockListNumbers: vi.fn(),
	mockReadNumbersStats: vi.fn(),
	mockRecordNumbersResult: vi.fn(),
	mockReadNumbersBoard: vi.fn(),
	mockReadPlayerName: vi.fn(),
	mockSetPlayerName: vi.fn(),
	mockDeleteGames: vi.fn(),
	mockListTrips: vi.fn(),
	mockCreateTrip: vi.fn(),
	mockUpdateTrip: vi.fn(),
	mockRemoveTrip: vi.fn(),
	mockUploadUrl: vi.fn(),
	mockDeleteUserPhotos: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
	db: { ping: mockPing },
}))

vi.mock('../handlers/places.js', () => ({
	MAX_PLACES: 1000,
	listPlaces: (...args: unknown[]) => mockListPlaces(...args),
	addPlace: (...args: unknown[]) => mockAddPlace(...args),
	updatePlace: (...args: unknown[]) => mockUpdatePlace(...args),
	removePlace: (...args: unknown[]) => mockRemovePlace(...args),
}))

vi.mock('../handlers/visits.js', () => ({
	MAX_VISITS: 1000,
	listVisits: (...args: unknown[]) => mockListVisits(...args),
	setVisit: (...args: unknown[]) => mockSetVisit(...args),
}))

vi.mock('../handlers/predictions.js', () => ({
	listPicks: (...args: unknown[]) => mockListPicks(...args),
	listAllPicks: (...args: unknown[]) => mockListAllPicks(...args),
	savePicks: (...args: unknown[]) => mockSavePicks(...args),
	deletePicks: (...args: unknown[]) => mockDeletePicks(...args),
}))

vi.mock('../handlers/numbers.js', () => ({
	listNumbers: (...args: unknown[]) => mockListNumbers(...args),
	readNumbersStats: (...args: unknown[]) => mockReadNumbersStats(...args),
	recordNumbersResult: (...args: unknown[]) => mockRecordNumbersResult(...args),
	readNumbersBoard: (...args: unknown[]) => mockReadNumbersBoard(...args),
}))

vi.mock('../handlers/games.js', () => ({
	readPlayerName: (...args: unknown[]) => mockReadPlayerName(...args),
	setPlayerName: (...args: unknown[]) => mockSetPlayerName(...args),
	deleteGames: (...args: unknown[]) => mockDeleteGames(...args),
}))

vi.mock('../handlers/trips.js', () => ({
	MAX_TRIPS: 1000,
	listTrips: (...args: unknown[]) => mockListTrips(...args),
	createTrip: (...args: unknown[]) => mockCreateTrip(...args),
	updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
	removeTrip: (...args: unknown[]) => mockRemoveTrip(...args),
}))

vi.mock('../lib/storage.js', async (original) => ({
	...(await original<typeof import('../lib/storage.js')>()),
	uploadUrl: (...args: unknown[]) => mockUploadUrl(...args),
	deleteUserPhotos: (...args: unknown[]) => mockDeleteUserPhotos(...args),
}))

vi.mock('../handlers/documents.js', () => ({
	deleteDocuments: (...args: unknown[]) => mockDeleteDocuments(...args),
}))

import { createMimirApp } from '../app.js'
import { DataError } from '../lib/errors.js'

// Each test gets a new app, so the rate limit of one user starts full in each.
let app = createMimirApp()

const USER_ID = '00000000-0000-4000-8000-000000000001'

const member = { id: USER_ID, roles: ['user'], is_verified: true }

function headers(user: object | null = member) {
	return {
		Authorization: `Bearer ${API_KEY}`,
		'Content-Type': 'application/json',
		...(user ? { 'x-mimir-user': JSON.stringify(user) } : {}),
	}
}

const draft = {
	name: 'Cafe',
	category: 'food',
	address: '1 Main St',
	latitude: 40,
	longitude: -80,
	visits: [{ visitedAt: '2026-09-27', rating: 4, photos: [] }],
}

const noRuns = { scores: Array.from({ length: 21 }, () => 0), daily: {} }

const numbers = { solo: { ...noRuns, daily: { 20261116: 12 } }, vsCpu: noRuns }

const place = {
	...draft,
	id: 'place-1',
	createdAt: '2026-09-27T12:00:00.000Z',
	visits: [{ ...draft.visits[0], id: 'visit-1' }],
}

function post(body: unknown, user: object | null = member) {
	return app.request('/api/places', {
		method: 'POST',
		headers: headers(user),
		body: JSON.stringify(body),
	})
}

beforeEach(() => {
	vi.resetAllMocks()

	app = createMimirApp()
})

describe('api key', () => {
	it('rejects requests without the key', async () => {
		const res = await app.request('/api/places')

		expect(res.status).toBe(401)

		expect(mockListPlaces).not.toHaveBeenCalled()
	})

	it('leaves health open', async () => {
		mockPing.mockResolvedValue(true)

		const res = await app.request('/api/health')

		expect(res.status).toBe(200)
	})
})

describe('forwarded user', () => {
	it('returns 401 without a user', async () => {
		const res = await app.request('/api/places', { headers: headers(null) })

		expect(res.status).toBe(401)
	})

	it('returns 401 for a user that does not parse', async () => {
		const res = await app.request('/api/places', {
			headers: { ...headers(null), 'x-mimir-user': '{not json' },
		})

		expect(res.status).toBe(401)
	})

	it("reads the user's own places, and never caches them", async () => {
		mockListPlaces.mockResolvedValue([place])

		const res = await app.request('/api/places', { headers: headers() })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual([place])

		expect(mockListPlaces).toHaveBeenCalledWith(USER_ID)

		expect(res.headers.get('cache-control')).toBe('private, no-store')
	})

	it('lets a user without roles read', async () => {
		mockListPlaces.mockResolvedValue([])

		const res = await app.request('/api/places', {
			headers: headers({ ...member, roles: [] }),
		})

		expect(res.status).toBe(200)
	})

	it('marks errors as one user’s data too', async () => {
		const res = await app.request('/api/places', { headers: headers(null) })

		expect(res.headers.get('cache-control')).toBe('private, no-store')
	})
})

describe('account', () => {
	it("returns all of the user's data", async () => {
		mockListPlaces.mockResolvedValue([place])

		mockListVisits.mockResolvedValue({ states: ['Ohio'], countries: [] })

		mockListAllPicks.mockResolvedValue({ 2026: { 1: { g1: { team: 't1', line: null } } } })

		mockListTrips.mockResolvedValue([])

		mockListNumbers.mockResolvedValue(numbers)

		mockReadPlayerName.mockResolvedValue('Ada')

		const res = await app.request('/api/account', { headers: headers() })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual({
			places: [place],
			visits: { states: ['Ohio'], countries: [] },
			trips: [],
			predictions: { 2026: { 1: { g1: { team: 't1', line: null } } } },
			numbers,
			games: { name: 'Ada' },
		})

		expect(res.headers.get('cache-control')).toBe('private, no-store')
	})

	it("deletes all of the user's data, whatever their roles", async () => {
		const res = await app.request('/api/account', {
			method: 'DELETE',
			headers: headers({ ...member, roles: [], is_verified: false }),
		})

		expect(res.status).toBe(204)

		expect(mockDeleteDocuments).toHaveBeenCalledWith(USER_ID)

		expect(mockDeleteGames).toHaveBeenCalledWith(USER_ID)

		expect(mockDeleteUserPhotos).toHaveBeenCalledWith(USER_ID)
	})

	it('needs a user', async () => {
		const res = await app.request('/api/account', { method: 'DELETE', headers: headers(null) })

		expect(res.status).toBe(401)

		expect(mockDeleteDocuments).not.toHaveBeenCalled()
	})
})

describe('writes', () => {
	it.each([
		['POST', '/api/places'],
		['PUT', '/api/places/place-1'],
		['DELETE', '/api/places/place-1'],
		['PUT', '/api/visits/states/Ohio'],
		['POST', '/api/trips'],
		['PUT', '/api/trips/trip-1'],
		['DELETE', '/api/trips/trip-1'],
		['POST', '/api/photos/uploads'],
		['PUT', '/api/predictions/2026/5'],
		['DELETE', '/api/predictions/2026/5'],
		['POST', '/api/games/numbers/results'],
		['PUT', '/api/games/player'],
	])('%s %s needs the user role', async (method, path) => {
		const res = await app.request(path, {
			method,
			headers: headers({ ...member, roles: [] }),
			body: method === 'DELETE' ? undefined : '{}',
		})

		expect(res.status).toBe(403)

		expect(await res.json()).toMatchObject({ message: 'The user role is required' })
	})

	it('needs a verified email', async () => {
		const res = await post(draft, { ...member, is_verified: false })

		expect(res.status).toBe(403)

		expect(await res.json()).toMatchObject({ message: 'Verify your email to make changes' })

		expect(mockAddPlace).not.toHaveBeenCalled()
	})

	it('adds a place', async () => {
		mockAddPlace.mockResolvedValue(place)

		const res = await post({ ...draft, name: '  Cafe  ' })

		expect(res.status).toBe(201)

		expect(mockAddPlace).toHaveBeenCalledWith(USER_ID, draft)
	})

	it('names every field that is wrong', async () => {
		const res = await post({
			...draft,
			name: ' ',
			latitude: 91,
			visits: [{ visitedAt: '2026-02-31', rating: 4, photos: [] }],
		})

		expect(res.status).toBe(400)

		const { message } = (await res.json()) as { message: string }

		expect(message).toContain('`name` is required.')

		expect(message).toContain('`latitude` must be a number between -90 and 90.')

		expect(message).toContain('`visitedAt` must be a YYYY-MM-DD day.')
	})

	it('takes a half-step rating and refuses any other fraction', async () => {
		const visit = (rating: number) => ({
			...draft,
			visits: [{ visitedAt: '2026-09-27', rating, photos: [] }],
		})

		mockAddPlace.mockResolvedValue(place)

		expect((await post(visit(3.5))).status).toBe(201)

		const res = await post(visit(3.3))

		expect(res.status).toBe(400)

		expect(await res.json()).toMatchObject({
			message: '`rating` must be a half step from 0 to 5.',
		})
	})

	it('refuses an address that is not http or https', async () => {
		const res = await post({ ...draft, url: 'javascript:alert(1)' })

		expect(res.status).toBe(400)

		expect(await res.json()).toMatchObject({
			message: '`url` must be an http or https address.',
		})
	})

	it('returns 409 at the cap', async () => {
		mockAddPlace.mockResolvedValue(null)

		const res = await post(draft)

		expect(res.status).toBe(409)
	})

	it('returns 404 when replacing a place that is not there', async () => {
		mockUpdatePlace.mockResolvedValue(null)

		const res = await app.request('/api/places/nope', {
			method: 'PUT',
			headers: headers(),
			body: JSON.stringify(draft),
		})

		expect(res.status).toBe(404)
	})

	it('removes a place', async () => {
		mockRemovePlace.mockResolvedValue(true)

		const res = await app.request('/api/places/place-1', {
			method: 'DELETE',
			headers: headers(),
		})

		expect(res.status).toBe(204)

		expect(mockRemovePlace).toHaveBeenCalledWith(USER_ID, 'place-1')
	})

	it('marks a region visited', async () => {
		mockSetVisit.mockResolvedValue({ states: ['New York'], countries: [] })

		const res = await app.request('/api/visits/states/New%20York', {
			method: 'PUT',
			headers: headers(),
			body: JSON.stringify({ visited: true }),
		})

		expect(res.status).toBe(200)

		expect(mockSetVisit).toHaveBeenCalledWith(USER_ID, 'states', 'New York', true)
	})

	it('refuses an unknown scope', async () => {
		const res = await app.request('/api/visits/cities/Paris', {
			method: 'PUT',
			headers: headers(),
			body: JSON.stringify({ visited: true }),
		})

		expect(res.status).toBe(400)

		expect(mockSetVisit).not.toHaveBeenCalled()
	})
})

describe('rate limit', () => {
	// The bucket refills with the clock, so a slow run would earn back tokens mid-burst.
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] })
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('counts each user apart', async () => {
		mockListPlaces.mockResolvedValue([])

		const other = { ...member, id: '00000000-0000-4000-8000-000000000009' }

		const statuses: number[] = []

		for (let i = 0; i < 61; i++) {
			statuses.push((await app.request('/api/places', { headers: headers(other) })).status)
		}

		expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true)

		expect(statuses[60]).toBe(429)

		expect((await app.request('/api/places', { headers: headers() })).status).toBe(200)
	})
})

describe('OpenAPI', () => {
	// Midgard generates its client types from this file. Run `pnpm openapi` after an API change.
	it('matches the committed openapi.json', async () => {
		const res = await app.request('/api/openapi.json')

		expect(res.status).toBe(200)

		const spec = await res.json()

		await expect(`${JSON.stringify(spec, null, '\t')}\n`).toMatchFileSnapshot('../../openapi.json')
	})
})

describe('predictions', () => {
	it('lists the picks of a season', async () => {
		mockListPicks.mockResolvedValue({ 5: { g1: { team: 't1', line: null } } })

		const res = await app.request('/api/predictions/2026', { headers: headers() })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual({ 5: { g1: { team: 't1', line: null } } })

		expect(mockListPicks).toHaveBeenCalledWith(USER_ID, 2026)
	})

	it('saves the picks of a week', async () => {
		mockSavePicks.mockImplementation(async (_user, _season, _week, picks) => picks)

		const res = await app.request('/api/predictions/2026/5', {
			method: 'PUT',
			headers: headers(),
			body: JSON.stringify({ picks: { g1: { team: 't1', line: -3.5 } } }),
		})

		expect(res.status).toBe(200)

		expect(mockSavePicks).toHaveBeenCalledWith(USER_ID, 2026, 5, {
			g1: { team: 't1', line: -3.5 },
		})
	})

	it('deletes the picks of a week', async () => {
		const res = await app.request('/api/predictions/2026/5', {
			method: 'DELETE',
			headers: headers(),
		})

		expect(res.status).toBe(204)

		expect(mockDeletePicks).toHaveBeenCalledWith(USER_ID, 2026, 5)
	})

	it.each([
		['/api/predictions/1999/5', { g1: { team: 't1', line: null } }],
		['/api/predictions/2026/0', { g1: { team: 't1', line: null } }],
		['/api/predictions/2026/5', { g1: { team: '<script>', line: null } }],
		['/api/predictions/2026/5', { g1: 't1' }],
		['/api/predictions/2026/5', { g1: { team: 't1', line: 99 } }],
		['/api/predictions/2026/5', { g1: { team: 't1' } }],
	])('refuses PUT %s with %j', async (path, picks) => {
		const res = await app.request(path, {
			method: 'PUT',
			headers: headers(),
			body: JSON.stringify({ picks }),
		})

		expect(res.status).toBe(400)

		expect(mockSavePicks).not.toHaveBeenCalled()
	})
})

describe('numbers', () => {
	const noStats = {
		played: 0,
		wins: 0,
		best: null,
		average: null,
		scores: noRuns.scores,
		streak: 0,
		bestStreak: 0,
	}

	const stats = { solo: { ...noStats, played: 1, best: 12, average: 12 }, vsCpu: noStats }

	const result = { seed: '20261116', score: 12, mode: 'solo', today: '20261116' }

	it('reads your stats as of your date', async () => {
		mockReadNumbersStats.mockResolvedValue(stats)

		const res = await app.request('/api/games/numbers/stats?today=20261116', { headers: headers() })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual(stats)

		expect(mockReadNumbersStats).toHaveBeenCalledWith(USER_ID, '20261116')
	})

	it('counts a run and answers the new stats', async () => {
		mockRecordNumbersResult.mockResolvedValue(stats)

		const res = await app.request('/api/games/numbers/results', {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify(result),
		})

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual(stats)

		expect(mockRecordNumbersResult).toHaveBeenCalledWith(USER_ID, result)
	})

	it.each(['', '?today=2026-11-16', '?today=20260231'])(
		'refuses the stats with %j',
		async (query) => {
			const res = await app.request(`/api/games/numbers/stats${query}`, { headers: headers() })

			expect(res.status).toBe(400)

			expect(mockReadNumbersStats).not.toHaveBeenCalled()
		},
	)

	it.each([
		{ score: 21 },
		{ score: 4.5 },
		{ mode: 'group' },
		{ seed: 'K3X9Q2' },
		{ today: '2026111' },
	])('refuses a result with %j', async (change) => {
		const res = await app.request('/api/games/numbers/results', {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ ...result, ...change }),
		})

		expect(res.status).toBe(400)

		expect(mockRecordNumbersResult).not.toHaveBeenCalled()
	})

	it('reads the leaderboard of a daily puzzle', async () => {
		const board = { players: 1, entries: [{ rank: 1, name: null, score: 12, you: true }] }

		mockReadNumbersBoard.mockResolvedValue(board)

		const res = await app.request('/api/games/numbers/daily?date=20261116&mode=vsCpu', {
			headers: headers(),
		})

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual(board)

		expect(mockReadNumbersBoard).toHaveBeenCalledWith(USER_ID, '20261116', 'vsCpu')
	})

	it.each([
		'?mode=solo',
		'?date=20261116',
		'?date=20261116&mode=group',
		'?date=2026-11-16&mode=solo',
	])('refuses the leaderboard with %j', async (query) => {
		const res = await app.request(`/api/games/numbers/daily${query}`, { headers: headers() })

		expect(res.status).toBe(400)

		expect(mockReadNumbersBoard).not.toHaveBeenCalled()
	})

	it('needs a user for the leaderboard', async () => {
		const res = await app.request('/api/games/numbers/daily?date=20261116&mode=solo', {
			headers: headers(null),
		})

		expect(res.status).toBe(401)
	})
})

describe('game player', () => {
	function put(body: unknown) {
		return app.request('/api/games/player', {
			method: 'PUT',
			headers: headers(),
			body: JSON.stringify(body),
		})
	}

	it('reads your leaderboard name', async () => {
		mockReadPlayerName.mockResolvedValue(null)

		const res = await app.request('/api/games/player', { headers: headers() })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual({ name: null })

		expect(mockReadPlayerName).toHaveBeenCalledWith(USER_ID)
	})

	it('sets your leaderboard name without the spaces at each end', async () => {
		const res = await put({ name: '  Ada  ' })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual({ name: 'Ada' })

		expect(mockSetPlayerName).toHaveBeenCalledWith(USER_ID, 'Ada')
	})

	it('removes your leaderboard name with null', async () => {
		const res = await put({ name: null })

		expect(res.status).toBe(200)

		expect(mockSetPlayerName).toHaveBeenCalledWith(USER_ID, null)
	})

	it.each([
		{},
		{ name: '' },
		{ name: '   ' },
		{ name: 'a'.repeat(25) },
		{ name: 'Ada\u202e' },
		{ name: 7 },
	])('refuses %j', async (body) => {
		const res = await put(body)

		expect(res.status).toBe(400)

		expect(mockSetPlayerName).not.toHaveBeenCalled()
	})
})

describe('trips', () => {
	const trip = {
		name: 'Pittsburgh',
		address: 'Pittsburgh, PA',
		latitude: 40,
		longitude: -80,
		startsOn: '2026-09-25',
		endsOn: '2026-09-28',
		photos: [`users/${USER_ID}/00000000-0000-4000-8000-00000000000a.jpg`],
	}

	const stored = { ...trip, id: 'trip-1', createdAt: '2026-09-27T12:00:00.000Z', photos: [] }

	function send(method: string, path: string, body: unknown) {
		return app.request(path, { method, headers: headers(), body: JSON.stringify(body) })
	}

	it('lists your trips', async () => {
		mockListTrips.mockResolvedValue([stored])

		const res = await app.request('/api/trips', { headers: headers() })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual([stored])

		expect(mockListTrips).toHaveBeenCalledWith(USER_ID)
	})

	it('adds a trip with its stops', async () => {
		mockCreateTrip.mockResolvedValue({ trip: stored, places: [] })

		const stops = [{ place: draft }, { placeId: 'place-1', visit: draft.visits[0] }]

		const res = await send('POST', '/api/trips', { ...trip, stops })

		expect(res.status).toBe(201)

		expect(mockCreateTrip).toHaveBeenCalledWith(USER_ID, { ...trip, stops })
	})

	it('takes the key an upload gave, beside the key of a kept photo', async () => {
		mockUploadUrl.mockResolvedValue('https://bucket.test/upload')

		mockCreateTrip.mockResolvedValue({ trip: stored, places: [] })

		mockUpdatePlace.mockResolvedValue(place)

		const upload = await app.request('/api/photos/uploads', {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ contentType: 'image/jpeg', size: 1000 }),
		})

		const { key } = (await upload.json()) as { key: string }

		const photos = [key, ...trip.photos]

		expect((await send('POST', '/api/trips', { ...trip, photos })).status).toBe(201)

		expect(mockCreateTrip).toHaveBeenCalledWith(USER_ID, { ...trip, photos })

		const visits = [{ ...draft.visits[0], photos }]

		expect((await send('PUT', '/api/places/place-1', { ...draft, visits })).status).toBe(200)

		expect(mockUpdatePlace).toHaveBeenCalledWith(USER_ID, 'place-1', { ...draft, visits })
	})

	it.each([
		['ends before it starts', { ...trip, endsOn: '2026-09-24' }, '`endsOn` must be on or after'],
		['has a photo address', { ...trip, photos: ['https://example.com/a.jpg'] }, 'A photo must be'],
		[
			'has a new place with two visits',
			{ ...trip, stops: [{ place: { ...draft, visits: [...draft.visits, ...draft.visits] } }] },
			'A new place on a trip has one visit.',
		],
	])('refuses a trip that %s', async (_, body, message) => {
		const res = await send('POST', '/api/trips', body)

		expect(res.status).toBe(400)

		expect(((await res.json()) as { message: string }).message).toContain(message)

		expect(mockCreateTrip).not.toHaveBeenCalled()
	})

	it('names the rule a write breaks', async () => {
		mockUpdateTrip.mockRejectedValue(
			new DataError('trip-days-exclude-visits', 'The new days would leave out a visit'),
		)

		const res = await send('PUT', '/api/trips/trip-1', trip)

		expect(res.status).toBe(409)

		expect(await res.json()).toMatchObject({ code: 'trip-days-exclude-visits' })
	})

	it('returns 404 when replacing or removing a trip that is not there', async () => {
		mockUpdateTrip.mockResolvedValue(null)

		mockRemoveTrip.mockResolvedValue(false)

		expect((await send('PUT', '/api/trips/nope', trip)).status).toBe(404)

		expect(
			(await app.request('/api/trips/nope', { method: 'DELETE', headers: headers() })).status,
		).toBe(404)
	})

	it('removes a trip', async () => {
		mockRemoveTrip.mockResolvedValue(true)

		const res = await app.request('/api/trips/trip-1', { method: 'DELETE', headers: headers() })

		expect(res.status).toBe(204)

		expect(mockRemoveTrip).toHaveBeenCalledWith(USER_ID, 'trip-1')
	})
})

describe('photo uploads', () => {
	function start(body: unknown) {
		return app.request('/api/photos/uploads', {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify(body),
		})
	}

	it("answers with an upload key under the user's id and its upload URL", async () => {
		mockUploadUrl.mockResolvedValue('https://bucket.test/upload')

		const res = await start({ contentType: 'image/webp', size: 1000 })

		expect(res.status).toBe(200)

		const { key, uploadUrl } = (await res.json()) as { key: string; uploadUrl: string }

		expect(key).toMatch(new RegExp(`^uploads/${USER_ID}/[0-9a-f-]{36}\\.webp$`))

		expect(uploadUrl).toBe('https://bucket.test/upload')

		expect(mockUploadUrl).toHaveBeenCalledWith(key, 'image/webp', 1000)
	})

	it.each([
		[{ contentType: 'image/gif', size: 1000 }],
		[{ contentType: 'image/jpeg', size: 15 * 1024 * 1024 + 1 }],
		[{ contentType: 'image/jpeg', size: 0 }],
	])('refuses %j', async (body) => {
		const res = await start(body)

		expect(res.status).toBe(400)

		expect(mockUploadUrl).not.toHaveBeenCalled()
	})
})
