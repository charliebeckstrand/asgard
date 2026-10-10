vi.mock('../../handlers/documents.js', () => import('./documents-mock.js'))

import { deletePicks, listAllPicks, listPicks, savePicks } from '../../handlers/predictions.js'
import { documents } from './documents-mock.js'

const USER = 'user-1'

/** A pick of `team` with no line yet. */
const pick = (team: string) => ({ team, line: null })

beforeEach(() => {
	documents.clear()
})

describe('predictions', () => {
	it('starts empty', async () => {
		expect(await listPicks(USER, 2026)).toEqual({})
	})

	it('saves the picks of each week apart', async () => {
		await savePicks(USER, 2026, 1, { g1: pick('t1') })

		await savePicks(USER, 2026, 2, { g2: pick('t2') })

		await savePicks(USER, 2026, 1, { g1: { team: 't3', line: -3.5 } })

		expect(await listPicks(USER, 2026)).toEqual({
			1: { g1: { team: 't3', line: -3.5 } },
			2: { g2: pick('t2') },
		})

		expect(await listPicks(USER, 2025)).toEqual({})
	})

	it('deletes one week, the same when sent twice', async () => {
		await savePicks(USER, 2026, 1, { g1: pick('t1') })

		await savePicks(USER, 2026, 2, { g2: pick('t2') })

		await deletePicks(USER, 2026, 1)

		await deletePicks(USER, 2026, 1)

		expect(await listPicks(USER, 2026)).toEqual({ 2: { g2: pick('t2') } })
	})

	it('leaves out a stored week that does not read as picks', async () => {
		documents.set(`${USER}:predictions`, {
			2026: { 1: { g1: pick('t1') }, 2: 'broken', 3: { g1: 't1' } },
		})

		expect(await listPicks(USER, 2026)).toEqual({ 1: { g1: pick('t1') } })
	})

	it('lists every season for the export', async () => {
		await savePicks(USER, 2025, 18, { g1: pick('t1') })

		await savePicks(USER, 2026, 1, { g2: pick('t2') })

		expect(await listAllPicks(USER)).toEqual({
			2025: { 18: { g1: pick('t1') } },
			2026: { 1: { g2: pick('t2') } },
		})
	})
})
