const { mockReadBoard, mockRecordBestScore, mockRecordPlayerName } = vi.hoisted(() => ({
	mockReadBoard: vi.fn(),
	mockRecordBestScore: vi.fn(),
	mockRecordPlayerName: vi.fn(),
}))

vi.mock('../../handlers/documents.js', () => import('./documents-mock.js'))

vi.mock('../../handlers/games.js', () => ({
	readBoard: (...args: unknown[]) => mockReadBoard(...args),
	recordBestScore: (...args: unknown[]) => mockRecordBestScore(...args),
	recordPlayerName: (...args: unknown[]) => mockRecordPlayerName(...args),
}))

import {
	listNumbers,
	readNumbersBoard,
	readNumbersStats,
	recordNumbersResult,
} from '../../handlers/numbers.js'
import { documents, transaction } from './documents-mock.js'

const USER = 'user-1'

const TODAY = '20261116'

/** The seed of each run of {@link run}, so each run has a seed of its own. */
let seeds = 0

/** A run of `score` on a new seed. */
const run = (score: number, mode: 'solo' | 'vsCpu' = 'solo') => {
	seeds += 1

	return { seed: `k3x9q${seeds}`, score, mode, today: TODAY }
}

/** The count of runs on each score, from the scores of `runs`. */
const counts = (...scores: number[]) =>
	Array.from({ length: 21 }, (_, score) => scores.filter((value) => value === score).length)

beforeEach(() => {
	vi.resetAllMocks()

	documents.clear()

	vi.useFakeTimers({ toFake: ['Date'] })

	vi.setSystemTime(new Date('2026-11-16T12:00:00Z'))
})

afterEach(() => {
	vi.useRealTimers()
})

describe('numbers', () => {
	it('starts with no runs', async () => {
		expect((await readNumbersStats(USER)).solo).toEqual({
			played: 0,
			wins: 0,
			best: null,
			average: null,
			scores: counts(),
			winRate: null,
		})
	})

	it('counts every run of a new seed, and answers the new stats', async () => {
		await recordNumbersResult(USER, null, run(7))

		await recordNumbersResult(USER, null, run(20))

		const stats = await recordNumbersResult(USER, null, run(12))

		expect(stats.solo).toMatchObject({ played: 3, wins: 1, best: 20, average: 13 })

		expect(stats.solo.scores).toEqual(counts(7, 20, 12))

		expect(await readNumbersStats(USER)).toEqual(stats)
	})

	it('keeps the stats of each mode apart', async () => {
		await recordNumbersResult(USER, null, run(7, 'vsCpu'))

		const stats = await readNumbersStats(USER)

		expect(stats.solo.played).toBe(0)

		expect(stats.vsCpu).toMatchObject({ played: 1, best: 7 })
	})

	it('counts only the first run of a seed in a mode, and answers the stats as they were on a replay', async () => {
		const first = run(4)

		const stats = await recordNumbersResult(USER, 'Ada', first)

		mockRecordBestScore.mockClear()

		mockRecordPlayerName.mockClear()

		expect(await recordNumbersResult(USER, 'Ada', { ...first, score: 18 })).toEqual(stats)

		expect(await readNumbersStats(USER)).toEqual(stats)

		expect(stats.solo).toMatchObject({ played: 1, best: 4 })

		expect(mockRecordBestScore).not.toHaveBeenCalled()

		expect(mockRecordPlayerName).not.toHaveBeenCalled()

		expect((await listNumbers(USER)).solo.seeds).toEqual([first.seed])

		// The other mode keeps its own seeds.
		await recordNumbersResult(USER, null, { ...first, mode: 'vsCpu' })

		expect((await readNumbersStats(USER)).vsCpu.played).toBe(1)
	})

	it('counts a run of a seed from before Mimir kept the seeds', async () => {
		documents.set(`${USER}:numbers`, { solo: { scores: counts(4), daily: {} } })

		expect((await recordNumbersResult(USER, null, run(18))).solo.played).toBe(2)
	})

	it('sends each run to its leaderboard of the reader date, in the same transaction', async () => {
		await recordNumbersResult(USER, null, run(20))

		await recordNumbersResult(USER, null, { ...run(4), seed: TODAY })

		await recordNumbersResult(USER, null, { ...run(7, 'vsCpu'), beatCpu: true })

		const result = (mode: string, score: number) => ({
			game: 'numbers',
			mode,
			date: TODAY,
			userId: USER,
			score,
		})

		expect(mockRecordBestScore.mock.calls).toEqual([
			[transaction, result('solo', 20)],
			[transaction, result('solo', 4)],
			[transaction, result('vsCpu', 7)],
		])
	})

	it('keeps a vs CPU run that tied or lost off the leaderboard, and counts it in the stats', async () => {
		await recordNumbersResult(USER, null, { ...run(15, 'vsCpu'), beatCpu: false })

		await recordNumbersResult(USER, null, run(12, 'vsCpu'))

		expect(mockRecordBestScore).not.toHaveBeenCalled()

		expect((await readNumbersStats(USER)).vsCpu).toMatchObject({ played: 2, best: 15 })
	})

	it('answers the share of vs CPU runs that beat the CPU, of the runs with an outcome', async () => {
		await recordNumbersResult(USER, null, { ...run(12, 'vsCpu'), beatCpu: true })

		await recordNumbersResult(USER, null, { ...run(9, 'vsCpu'), beatCpu: false })

		await recordNumbersResult(USER, null, { ...run(15, 'vsCpu'), beatCpu: true })

		await recordNumbersResult(USER, null, { ...run(8, 'vsCpu'), beatCpu: false })

		// A run from an app before `beatCpu` counts in the stats, but not in the share.
		await recordNumbersResult(USER, null, run(10, 'vsCpu'))

		const stats = await readNumbersStats(USER)

		expect(stats.vsCpu).toMatchObject({ played: 5, winRate: 0.5 })

		expect(stats.solo.winRate).toBeNull()

		expect((await listNumbers(USER)).vsCpu.cpu).toEqual({ played: 4, beat: 2 })
	})

	it('has no share of wins for vs CPU runs from before the outcome counts', async () => {
		await recordNumbersResult(USER, null, run(10, 'vsCpu'))

		expect((await readNumbersStats(USER)).vsCpu).toMatchObject({ played: 1, winRate: null })

		expect((await listNumbers(USER)).vsCpu).not.toHaveProperty('cpu')
	})

	it('keeps the name of the account with each run, in the same transaction', async () => {
		await recordNumbersResult(USER, 'Ada', run(7))

		expect(mockRecordPlayerName).toHaveBeenCalledWith(transaction, USER, 'Ada')
	})

	it.each(['20261114', '20261118'])(
		'refuses a reader date of %s, more than a day away',
		async (today) => {
			await expect(recordNumbersResult(USER, null, { ...run(5), today })).rejects.toMatchObject({
				status: 400,
			})
		},
	)

	it('reads a stored mode that is not a mode as empty', async () => {
		documents.set(`${USER}:numbers`, { solo: { scores: [1, 2] }, vsCpu: 'broken' })

		const stats = await readNumbersStats(USER)

		expect(stats.solo.played).toBe(0)

		expect(stats.vsCpu.played).toBe(0)
	})

	it('reads a stored mode with the daily scores of an earlier app, and leaves them out', async () => {
		documents.set(`${USER}:numbers`, { solo: { scores: counts(4), daily: { [TODAY]: 4 } } })

		expect((await readNumbersStats(USER)).solo.played).toBe(1)

		expect((await listNumbers(USER)).solo).toEqual({ scores: counts(4) })
	})

	it.each(['20261101', '20261117'])('reads the leaderboard of %s', async (date) => {
		const board = { players: 0, entries: [] }

		mockReadBoard.mockResolvedValue(board)

		expect(await readNumbersBoard(USER, date, 'vsCpu')).toBe(board)

		expect(mockReadBoard).toHaveBeenCalledWith('numbers', 'vsCpu', date, USER)
	})

	it('reads the leaderboard for a reader with no session', async () => {
		const board = { players: 0, entries: [] }

		mockReadBoard.mockResolvedValue(board)

		expect(await readNumbersBoard(null, '20261116', 'solo')).toBe(board)

		expect(mockReadBoard).toHaveBeenCalledWith('numbers', 'solo', '20261116', null)
	})

	it('refuses the leaderboard of a date more than a day ahead', async () => {
		expect(() => readNumbersBoard(USER, '20261118', 'solo')).toThrow(
			expect.objectContaining({ status: 400 }),
		)

		expect(mockReadBoard).not.toHaveBeenCalled()
	})
})
