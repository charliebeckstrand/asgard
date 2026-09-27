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

import { addPlace } from '../../handlers/places.js'
import { listVisits, MAX_VISITS, setVisit } from '../../handlers/visits.js'

const USER = 'user-1'

beforeEach(() => {
	documents.clear()
})

describe('visits', () => {
	it('starts empty', async () => {
		expect(await listVisits(USER)).toEqual({ states: [], countries: [] })
	})

	it('counts the regions of places as visited until the first change', async () => {
		await addPlace(USER, {
			name: 'Cafe',
			category: 'food',
			address: '1 Main St',
			state: 'Ohio',
			country: 'United States',
			latitude: 40,
			longitude: -80,
			rating: 0,
			visitedAt: '2026-09-27',
		})

		expect(await listVisits(USER)).toEqual({ states: ['Ohio'], countries: ['United States'] })

		expect(await setVisit(USER, 'states', 'Maine', true)).toEqual({
			states: ['Maine', 'Ohio'],
			countries: ['United States'],
		})
	})

	it('marks and unmarks a region, the same when sent twice', async () => {
		await setVisit(USER, 'countries', 'Georgia', true)

		expect(await setVisit(USER, 'countries', 'Georgia', true)).toEqual({
			states: [],
			countries: ['Georgia'],
		})

		expect(await setVisit(USER, 'countries', 'Georgia', false)).toEqual({
			states: [],
			countries: [],
		})
	})

	it('reads a bare list as states', async () => {
		documents.set(`${USER}:visits`, ['Texas', ' Ohio ', 'Texas', 7])

		expect(await listVisits(USER)).toEqual({ states: ['Ohio', 'Texas'], countries: [] })
	})

	it(`stops at ${MAX_VISITS} regions in a scope`, async () => {
		const states = Array.from({ length: MAX_VISITS }, (_, i) => `State ${i}`)

		documents.set(`${USER}:visits`, { states, countries: [] })

		expect(await setVisit(USER, 'states', 'One more', true)).toBeNull()

		expect(await setVisit(USER, 'countries', 'France', true)).not.toBeNull()
	})
})
