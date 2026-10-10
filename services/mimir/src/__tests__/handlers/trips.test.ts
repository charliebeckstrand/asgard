import { stubServiceEnv } from 'vali/env'

stubServiceEnv({ MIMIR_API_KEY: 'test-mimir-api-key-that-is-at-least-32-chars' })

const { mockDeletePhotos, mockKeepUpload } = vi.hoisted(() => ({
	mockDeletePhotos: vi.fn(),
	mockKeepUpload: vi.fn(),
}))

vi.mock('../../handlers/documents.js', () => import('./documents-mock.js'))

vi.mock('../../lib/storage.js', async (original) => ({
	...(await original<typeof import('../../lib/storage.js')>()),
	photoUrl: async (key: string) => `https://bucket.test/${key}?signed`,
	deletePhotos: mockDeletePhotos,
	keepUpload: mockKeepUpload,
}))

import { addPlace, listPlaces } from '../../handlers/places.js'
import { createTrip, listTrips, removeTrip, updateTrip } from '../../handlers/trips.js'
import type { PlaceDraft, TripDraft } from '../../lib/schemas.js'
import { documents } from './documents-mock.js'

const USER = '00000000-0000-4000-8000-000000000001'

/** The key of an upload. */
const photo = (name: string) => `uploads/${USER}/${name}.jpg`

/** The key the save keeps an upload under. */
const saved = (name: string) => `users/${USER}/${name}.jpg`

const draft: TripDraft = {
	name: 'Pittsburgh',
	address: 'Pittsburgh, PA',
	latitude: 40,
	longitude: -80,
	startsOn: '2026-09-25',
	endsOn: '2026-09-28',
	photos: [],
}

const place: PlaceDraft = {
	name: 'Cafe',
	category: 'food',
	address: '1 Main St',
	latitude: 40,
	longitude: -80,
	visits: [{ visitedAt: '2026-01-01', rating: 4, photos: [] }],
}

const visitOn = (visitedAt: string) => ({ visitedAt, rating: 5, photos: [] })

beforeEach(() => {
	documents.clear()

	mockDeletePhotos.mockReset().mockResolvedValue(undefined)

	mockKeepUpload.mockReset().mockResolvedValue(true)
})

describe('trips', () => {
	it('adds a trip with an id and when it was added', async () => {
		const { trip, places } = await createTrip(USER, draft)

		expect(trip).toEqual({ ...draft, id: expect.any(String), createdAt: expect.any(String) })

		expect(places).toEqual([])

		expect(await listTrips(USER)).toEqual([trip])

		expect(documents.has(`${USER}:places`)).toBe(false)
	})

	it('lists the newest trip first', async () => {
		await createTrip(USER, { ...draft, startsOn: '2026-01-01', endsOn: '2026-01-02' })

		await createTrip(USER, { ...draft, startsOn: '2026-06-01', endsOn: '2026-06-02' })

		const days = (await listTrips(USER)).map((trip) => trip.startsOn)

		expect(days).toEqual(['2026-06-01', '2026-01-01'])
	})

	it('answers with a URL for each photo', async () => {
		const { trip } = await createTrip(USER, { ...draft, photos: [photo('a')] })

		expect(trip.photos).toEqual([
			{ key: saved('a'), url: `https://bucket.test/${saved('a')}?signed` },
		])
	})

	it("refuses another user's photo", async () => {
		const other = 'users/00000000-0000-4000-8000-000000000002/a.jpg'

		await expect(createTrip(USER, { ...draft, photos: [other] })).rejects.toMatchObject({
			status: 400,
			code: 'photo-not-yours',
		})
	})

	describe('stops', () => {
		it('adds a visit to a stored place and a new place, both on the trip', async () => {
			const stored = await addPlace(USER, place)

			const { trip, places } = await createTrip(USER, {
				...draft,
				stops: [
					{ placeId: stored?.id ?? '', visit: visitOn('2026-09-26') },
					{ place: { ...place, name: 'Diner', visits: [visitOn('2026-09-27')] } },
				],
			})

			expect(places.map((changed) => changed.name)).toEqual(['Diner', 'Cafe'])

			expect(places[1]?.visits.map((visit) => [visit.visitedAt, visit.tripId])).toEqual([
				['2026-09-26', trip.id],
				['2026-01-01', undefined],
			])

			expect(places[0]?.visits[0]?.tripId).toBe(trip.id)

			expect(await listPlaces(USER)).toHaveLength(2)
		})

		it('puts an earlier visit on the trip by its id', async () => {
			const stored = await addPlace(USER, { ...place, visits: [visitOn('2026-09-26')] })

			const visit = stored?.visits[0]

			const { trip, places } = await createTrip(USER, {
				...draft,
				stops: [{ placeId: stored?.id ?? '', visit: { ...visitOn('2026-09-26'), id: visit?.id } }],
			})

			expect(places[0]?.visits).toEqual([{ ...visit, rating: 5, tripId: trip.id }])
		})

		it('refuses a stop outside the trip, and writes nothing', async () => {
			await expect(
				createTrip(USER, {
					...draft,
					stops: [{ place: { ...place, visits: [visitOn('2026-09-29')] } }],
				}),
			).rejects.toMatchObject({ status: 400, code: 'visit-outside-trip' })

			expect(documents.size).toBe(0)
		})

		it('refuses a stop at a place that is not there', async () => {
			await expect(
				createTrip(USER, { ...draft, stops: [{ placeId: 'nope', visit: visitOn('2026-09-26') }] }),
			).rejects.toMatchObject({ status: 400 })
		})
	})

	describe('replacing', () => {
		it('keeps its id and when it was added', async () => {
			const { trip } = await createTrip(USER, draft)

			const updated = await updateTrip(USER, trip.id, { ...draft, name: 'Steel City' })

			expect(updated).toEqual({ ...trip, name: 'Steel City' })
		})

		it('does not replace a trip that is not there', async () => {
			expect(await updateTrip(USER, 'nope', draft)).toBeNull()
		})

		it('refuses days that leave out one of its visits', async () => {
			const { trip } = await createTrip(USER, {
				...draft,
				stops: [{ place: { ...place, visits: [visitOn('2026-09-25')] } }],
			})

			await expect(
				updateTrip(USER, trip.id, { ...draft, startsOn: '2026-09-26' }),
			).rejects.toMatchObject({ status: 409, code: 'trip-days-exclude-visits' })

			expect(await updateTrip(USER, trip.id, { ...draft, endsOn: '2026-09-25' })).not.toBeNull()
		})

		it('deletes the photos it drops', async () => {
			const { trip } = await createTrip(USER, { ...draft, photos: [photo('a'), photo('b')] })

			await updateTrip(USER, trip.id, { ...draft, photos: [photo('b')] })

			expect(mockDeletePhotos).toHaveBeenCalledExactlyOnceWith([saved('a')])
		})
	})

	describe('removing', () => {
		it('keeps its visits without the trip, and deletes its photos', async () => {
			const { trip } = await createTrip(USER, {
				...draft,
				photos: [photo('a')],
				stops: [{ place: { ...place, visits: [visitOn('2026-09-26')] } }],
			})

			expect(await removeTrip(USER, trip.id)).toBe(true)

			expect(await listTrips(USER)).toEqual([])

			const [kept] = await listPlaces(USER)

			expect(kept?.visits).toHaveLength(1)

			expect(kept?.visits[0]).not.toHaveProperty('tripId')

			expect(mockDeletePhotos).toHaveBeenCalledExactlyOnceWith([saved('a')])
		})

		it('says when there was none', async () => {
			expect(await removeTrip(USER, 'nope')).toBe(false)
		})
	})
})
