const { documents } = vi.hoisted(() => ({ documents: new Map<string, unknown>() }))

// The documents as a map, so these tests cover what the handlers do with a
// document. documents.integration.test.ts covers the database.
vi.mock('../../handlers/documents.js', () => ({
	readDocument: async (userId: string, name: string) => documents.get(`${userId}:${name}`),
	changeDocument: async (
		userId: string,
		name: string,
		change: (document: unknown) => Promise<{ result: unknown; value?: unknown }>,
	) => {
		const { result, value } = await change(documents.get(`${userId}:${name}`))

		if (value !== undefined) documents.set(`${userId}:${name}`, value)

		return result
	},
}))

import {
	addPlace,
	listPlaces,
	MAX_PLACES,
	removePlace,
	updatePlace,
} from '../../handlers/places.js'
import type { PlaceDraft } from '../../lib/schemas.js'

const USER = 'user-1'

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

beforeEach(() => {
	documents.clear()
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
			visits: [...(place?.visits ?? []), { visitedAt: '2026-06-01', rating: 5, photos: [] }],
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
				photos: ['https://example.com/a.jpg'],
			},
		])

		expect(place).not.toHaveProperty('visitedAt')

		const updated = await updatePlace(USER, 'old', { ...draft, visits: place?.visits ?? [] })

		expect(documents.get(`${USER}:places`)).toEqual([updated])
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
			visits: place?.visits ?? [],
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
})
