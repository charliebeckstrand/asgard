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
	rating: 4,
	visitedAt: '2026-09-27',
}

beforeEach(() => {
	documents.clear()
})

describe('places', () => {
	it('adds a place with an id and when it was added', async () => {
		const place = await addPlace(USER, draft)

		expect(place).toMatchObject({ ...draft, id: expect.any(String) })

		expect(Date.parse(place?.createdAt ?? '')).not.toBeNaN()

		expect(await listPlaces(USER)).toEqual([place])
	})

	it('lists the newest visit first', async () => {
		await addPlace(USER, { ...draft, visitedAt: '2026-01-01' })

		await addPlace(USER, { ...draft, visitedAt: '2026-06-01' })

		const days = (await listPlaces(USER)).map((place) => place.visitedAt)

		expect(days).toEqual(['2026-06-01', '2026-01-01'])
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

		const updated = await updatePlace(USER, place?.id ?? '', { ...draft, name: 'Diner' })

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
