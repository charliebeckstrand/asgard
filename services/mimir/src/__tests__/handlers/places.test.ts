import { stubServiceEnv } from 'vali/env'

stubServiceEnv({ MIMIR_API_KEY: 'test-mimir-api-key-that-is-at-least-32-chars' })

const { mockPhotoExists } = vi.hoisted(() => ({ mockPhotoExists: vi.fn() }))

vi.mock('../../handlers/documents.js', () => import('./documents-mock.js'))

vi.mock('../../lib/storage.js', async (original) => ({
	...(await original<typeof import('../../lib/storage.js')>()),
	photoUrl: async (key: string) => `https://bucket.test/${key}?signed`,
	photoExists: mockPhotoExists,
}))

import {
	addPlace,
	listPlaces,
	MAX_PLACES,
	removePlace,
	updatePlace,
} from '../../handlers/places.js'
import type { Place, PlaceDraft } from '../../lib/schemas.js'
import { documents } from './documents-mock.js'

const USER = '00000000-0000-4000-8000-000000000001'

const photo = (name: string) => `users/${USER}/${name}.jpg`

const draft: PlaceDraft = {
	name: 'Cafe',
	category: 'food',
	address: '1 Main St',
	latitude: 40,
	longitude: -80,
	visits: [{ visitedAt: '2026-09-27', rating: 4, photos: [] }],
}

/** The draft with one visit on `visitedAt`. */
function visitedOn(visitedAt: string): PlaceDraft {
	return { ...draft, visits: [{ visitedAt, rating: 4, photos: [] }] }
}

/** A place as a draft sends it back: each photo by its key. */
function asDraft(place: Place | null): PlaceDraft {
	return {
		...draft,
		visits: (place?.visits ?? []).map((visit) => ({
			...visit,
			photos: visit.photos.map((stored) => stored.key),
		})),
	}
}

beforeEach(() => {
	documents.clear()

	mockPhotoExists.mockReset().mockResolvedValue(true)
})

describe('places', () => {
	it('adds a place with an id and when it was added', async () => {
		const place = await addPlace(USER, draft)

		expect(place).toMatchObject({
			...draft,
			id: expect.any(String),
			visits: [{ ...draft.visits[0], id: expect.any(String) }],
		})

		expect(Date.parse(place?.createdAt ?? '')).not.toBeNaN()

		expect(await listPlaces(USER)).toEqual([place])
	})

	it('lists the newest visit first', async () => {
		await addPlace(USER, visitedOn('2026-01-01'))

		await addPlace(USER, visitedOn('2026-06-01'))

		const days = (await listPlaces(USER)).map((place) => place.visits[0]?.visitedAt)

		expect(days).toEqual(['2026-06-01', '2026-01-01'])
	})

	it('stores the visits newest first, and keeps the id of each stored visit', async () => {
		const place = await addPlace(USER, visitedOn('2026-01-01'))

		const first = place?.visits[0]

		const updated = await updatePlace(USER, place?.id ?? '', {
			...draft,
			visits: [...asDraft(place).visits, { visitedAt: '2026-06-01', rating: 5, photos: [] }],
		})

		expect(updated?.visits.map((visit) => visit.visitedAt)).toEqual(['2026-06-01', '2026-01-01'])

		expect(updated?.visits[1]).toEqual(first)

		expect(updated?.visits[0]?.id).not.toBe(first?.id)
	})

	it('reads a place stored before visits as a place with one visit', async () => {
		documents.set(`${USER}:places`, [
			{
				id: 'old',
				createdAt: '2026-09-27T12:00:00.000Z',
				name: 'Cafe',
				category: 'food',
				address: '1 Main St',
				latitude: 40,
				longitude: -80,
				rating: 4,
				review: 'Good',
				photo: 'https://example.com/a.jpg',
				visitedAt: '2026-09-27',
			},
		])

		const [place] = await listPlaces(USER)

		expect(place?.visits).toEqual([
			{
				id: 'old',
				visitedAt: '2026-09-27',
				rating: 4,
				review: 'Good',
				photos: [{ key: 'https://example.com/a.jpg', url: 'https://example.com/a.jpg' }],
			},
		])

		expect(place).not.toHaveProperty('visitedAt')

		await updatePlace(USER, 'old', {
			...draft,
			visits: [{ id: 'old', visitedAt: '2026-09-27', rating: 4, review: 'Good', photos: [] }],
		})

		expect(documents.get(`${USER}:places`)).toEqual([
			expect.objectContaining({
				id: 'old',
				visits: [{ id: 'old', visitedAt: '2026-09-27', rating: 4, review: 'Good', photos: [] }],
			}),
		])
	})

	it('keeps each user apart', async () => {
		await addPlace(USER, draft)

		expect(await listPlaces('user-2')).toEqual([])
	})

	it(`stops at ${MAX_PLACES} places`, async () => {
		documents.set(
			`${USER}:places`,
			Array.from({ length: MAX_PLACES }, () => ({})),
		)

		expect(await addPlace(USER, draft)).toBeNull()
	})

	it('replaces a place, keeping its id and when it was added', async () => {
		const place = await addPlace(USER, draft)

		const updated = await updatePlace(USER, place?.id ?? '', {
			...draft,
			name: 'Diner',
			visits: asDraft(place).visits,
		})

		expect(updated).toEqual({ ...place, name: 'Diner' })
	})

	it('does not replace a place that is not there', async () => {
		expect(await updatePlace(USER, 'nope', draft)).toBeNull()

		expect(documents.has(`${USER}:places`)).toBe(false)
	})

	it('removes a place, and says when there was none', async () => {
		const place = await addPlace(USER, draft)

		expect(await removePlace(USER, place?.id ?? '')).toBe(true)

		expect(await removePlace(USER, place?.id ?? '')).toBe(false)
	})

	it('leaves out records it cannot read, but keeps them through writes', async () => {
		const unreadable = { id: 'old', name: 'No position' }

		documents.set(`${USER}:places`, [unreadable])

		const place = await addPlace(USER, draft)

		expect(await listPlaces(USER)).toEqual([place])

		await updatePlace(USER, place?.id ?? '', { ...draft, name: 'Diner' })

		await removePlace(USER, place?.id ?? '')

		expect(documents.get(`${USER}:places`)).toEqual([unreadable])
	})

	it('answers with a URL for each photo, and stores only its key', async () => {
		const place = await addPlace(USER, {
			...draft,
			visits: [{ visitedAt: '2026-09-27', rating: 4, photos: [photo('a')] }],
		})

		expect(place?.visits[0]?.photos).toEqual([
			{ key: photo('a'), url: `https://bucket.test/${photo('a')}?signed` },
		])

		expect(documents.get(`${USER}:places`)).toEqual([
			expect.objectContaining({ visits: [expect.objectContaining({ photos: [photo('a')] })] }),
		])
	})

	it("refuses another user's photo", async () => {
		const other = 'users/00000000-0000-4000-8000-000000000002/a.jpg'

		await expect(
			addPlace(USER, {
				...draft,
				visits: [{ visitedAt: '2026-09-27', rating: 4, photos: [other] }],
			}),
		).rejects.toMatchObject({ status: 400, code: 'photo-not-yours' })

		expect(documents.has(`${USER}:places`)).toBe(false)
	})

	it('checks each photo a write adds, and refuses one no longer in the bucket', async () => {
		const place = await addPlace(USER, {
			...draft,
			visits: [{ visitedAt: '2026-09-27', rating: 4, photos: [photo('a')] }],
		})

		expect(mockPhotoExists).toHaveBeenCalledExactlyOnceWith(photo('a'))

		mockPhotoExists.mockImplementation(async (key: string) => key !== photo('b'))

		await expect(
			updatePlace(USER, place?.id ?? '', {
				...draft,
				visits: [{ visitedAt: '2026-09-27', rating: 4, photos: [photo('a'), photo('b')] }],
			}),
		).rejects.toMatchObject({ status: 409, code: 'photo-missing' })

		expect(await listPlaces(USER)).toEqual([place])
	})

	it('makes no check for photos the places already hold', async () => {
		const place = await addPlace(USER, {
			...draft,
			visits: [{ visitedAt: '2026-09-27', rating: 4, photos: [photo('a')] }],
		})

		mockPhotoExists.mockClear()

		await updatePlace(USER, place?.id ?? '', { ...asDraft(place), name: 'Diner' })

		await removePlace(USER, place?.id ?? '')

		expect(mockPhotoExists).not.toHaveBeenCalled()
	})

	describe('trips', () => {
		const trip = {
			id: 'trip-1',
			createdAt: '2026-09-01T00:00:00.000Z',
			name: 'Pittsburgh',
			address: 'Pittsburgh, PA',
			latitude: 40,
			longitude: -80,
			startsOn: '2026-09-25',
			endsOn: '2026-09-28',
			photos: [],
		}

		const onDay = (visitedAt: string, tripId = 'trip-1'): PlaceDraft => ({
			...draft,
			visits: [{ visitedAt, rating: 4, photos: [], tripId }],
		})

		beforeEach(() => {
			documents.set(`${USER}:trips`, [trip])
		})

		it.each(['2026-09-25', '2026-09-28'])('keeps a visit on %s on the trip', async (day) => {
			const place = await addPlace(USER, onDay(day))

			expect(place?.visits[0]?.tripId).toBe('trip-1')
		})

		it.each([
			['before the trip', onDay('2026-09-24')],
			['after the trip', onDay('2026-09-29')],
			['on a trip that is not there', onDay('2026-09-26', 'trip-2')],
		])('refuses a visit %s', async (_, place) => {
			await expect(addPlace(USER, place)).rejects.toMatchObject({
				status: 400,
				code: 'visit-outside-trip',
			})
		})

		it('refuses a replaced place with a visit outside its trip', async () => {
			const place = await addPlace(USER, draft)

			await expect(updatePlace(USER, place?.id ?? '', onDay('2026-10-01'))).rejects.toMatchObject({
				code: 'visit-outside-trip',
			})
		})

		it("refuses another user's trip", async () => {
			documents.delete(`${USER}:trips`)

			documents.set('00000000-0000-4000-8000-000000000002:trips', [trip])

			await expect(addPlace(USER, onDay('2026-09-26'))).rejects.toMatchObject({
				code: 'visit-outside-trip',
			})
		})
	})
})
