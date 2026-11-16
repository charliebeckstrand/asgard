const { mockReadDailyBoard, mockRecordDailyResult } = vi.hoisted(() => ({
	mockReadDailyBoard: vi.fn(),
	mockRecordDailyResult: vi.fn(),
}))

vi.mock('../../handlers/documents.js', () => import('./documents-mock.js'))

vi.mock('../../handlers/games.js', () => ({
	readDailyBoard: (...args: unknown[]) => mockReadDailyBoard(...args),
	recordDailyResult: (...args: unknown[]) => mockRecordDailyResult(...args),
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

/** A run of `score` on a seed that is not a daily puzzle. */
const run = (score: number, mode: 'solo' | 'vsCpu' = 'solo') => ({
	seed: 'k3x9q2',
	score,
	mode,
	today: TODAY,
})

/** The first run of the daily puzzle of `date`, played on that date. */
const daily = (date: string, score = 10) => ({
	seed: date,
	score,
	mode: 'solo' as const,
	today: date,
})

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
		expect((await readNumbersStats(USER, TODAY)).solo).toEqual({
			played: 0,
			wins: 0,
			best: null,
			average: null,
			scores: counts(),
			streak: 0,
			bestStreak: 0,
		})
	})

	it('counts every run, replays included, and answers the new stats', async () => {
		await recordNumbersResult(USER, run(7))

		await recordNumbersResult(USER, run(20))

		const stats = await recordNumbersResult(USER, run(12))

		expect(stats.solo).toMatchObject({ played: 3, wins: 1, best: 20, average: 13 })

		expect(stats.solo.scores).toEqual(counts(7, 20, 12))

		expect(await readNumbersStats(USER, TODAY)).toEqual(stats)
	})

	it('keeps the stats of each mode apart', async () => {
		await recordNumbersResult(USER, run(7, 'vsCpu'))

		const stats = await readNumbersStats(USER, TODAY)

		expect(stats.solo.played).toBe(0)

		expect(stats.vsCpu).toMatchObject({ played: 1, best: 7 })
	})

	it('counts only the first run of a daily puzzle toward the streak', async () => {
		await recordNumbersResult(USER, daily(TODAY, 4))

		await recordNumbersResult(USER, daily(TODAY, 18))

		const stats = await readNumbersStats(USER, TODAY)

		expect(stats.solo).toMatchObject({ played: 2, streak: 1, bestStreak: 1 })

		expect((await listNumbers(USER)).solo.daily).toEqual({ [TODAY]: 4 })
	})

	it('keeps the first run of a daily puzzle for its leaderboard, in the same transaction', async () => {
		await recordNumbersResult(USER, daily(TODAY, 4))

		await recordNumbersResult(USER, daily(TODAY, 18))

		await recordNumbersResult(USER, run(20))

		expect(mockRecordDailyResult).toHaveBeenCalledTimes(1)

		expect(mockRecordDailyResult).toHaveBeenCalledWith(transaction, {
			game: 'numbers',
			mode: 'solo',
			date: TODAY,
			userId: USER,
			score: 4,
		})
	})

	it('does not count a seed of another date as the daily puzzle', async () => {
		await recordNumbersResult(USER, { ...daily('20261115'), today: TODAY })

		expect(await readNumbersStats(USER, TODAY)).toMatchObject({ solo: { played: 1, streak: 0 } })

		expect(mockRecordDailyResult).not.toHaveBeenCalled()
	})

	it('keeps a streak that ends yesterday, and ends one with a day missed', async () => {
		vi.setSystemTime(new Date('2026-11-14T12:00:00Z'))

		await recordNumbersResult(USER, daily('20261113'))

		await recordNumbersResult(USER, daily('20261114'))

		vi.setSystemTime(new Date('2026-11-15T12:00:00Z'))

		expect((await readNumbersStats(USER, '20261115')).solo.streak).toBe(2)

		vi.setSystemTime(new Date('2026-11-16T12:00:00Z'))

		expect((await readNumbersStats(USER, TODAY)).solo).toMatchObject({ streak: 0, bestStreak: 2 })
	})

	it('finds the longest streak among several', async () => {
		documents.set(`${USER}:numbers`, {
			solo: {
				scores: counts(1, 1, 1, 1, 1),
				daily: { 20261101: 1, 20261102: 1, 20261103: 1, 20261110: 1, 20261116: 1 },
			},
		})

		expect((await readNumbersStats(USER, TODAY)).solo).toMatchObject({ streak: 1, bestStreak: 3 })
	})

	it('counts a streak across the end of a month', async () => {
		documents.set(`${USER}:numbers`, {
			solo: { scores: counts(1, 1), daily: { 20261031: 1, 20261101: 1 } },
		})

		vi.setSystemTime(new Date('2026-11-01T12:00:00Z'))

		expect((await readNumbersStats(USER, '20261101')).solo.streak).toBe(2)
	})

	it.each(['20261114', '20261118'])(
		'refuses a reader date of %s, more than a day away',
		async (today) => {
			await expect(readNumbersStats(USER, today)).rejects.toMatchObject({ status: 400 })

			await expect(recordNumbersResult(USER, { ...run(5), today })).rejects.toMatchObject({
				status: 400,
			})
		},
	)

	it('reads a stored mode that is not a mode as empty', async () => {
		documents.set(`${USER}:numbers`, { solo: { scores: [1, 2] }, vsCpu: 'broken' })

		const stats = await readNumbersStats(USER, TODAY)

		expect(stats.solo.played).toBe(0)

		expect(stats.vsCpu.played).toBe(0)
	})

	it.each(['20261101', '20261117'])('reads the leaderboard of %s', async (date) => {
		const board = { players: 0, entries: [] }

		mockReadDailyBoard.mockResolvedValue(board)

		expect(await readNumbersBoard(USER, date, 'vsCpu')).toBe(board)

		expect(mockReadDailyBoard).toHaveBeenCalledWith('numbers', 'vsCpu', date, USER)
	})

	it('refuses the leaderboard of a date more than a day ahead', async () => {
		expect(() => readNumbersBoard(USER, '20261118', 'solo')).toThrow(
			expect.objectContaining({ status: 400 }),
		)

		expect(mockReadDailyBoard).not.toHaveBeenCalled()
	})
})
