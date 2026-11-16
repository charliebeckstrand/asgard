import { HTTPException } from 'grid'
import {
	MAX_SCORE,
	type NumbersBoard,
	type NumbersMode,
	type NumbersModeStats,
	type NumbersResult,
	type NumbersStats,
	type StoredNumbers,
	type StoredNumbersMode,
	StoredNumbersModeSchema,
} from '../lib/schemas.js'
import { changeDocument, readDocument } from './documents.js'
import { readDailyBoard, recordDailyResult } from './games.js'

/**
 * The results of the numbers app of each user, in one document. For each mode,
 * the count of runs that ended on each score, and the score of the first run of
 * each daily puzzle by its date. Every other stat comes from these on read. The
 * score of the first run of a daily puzzle also goes in `game_results`, in the
 * same transaction, for the leaderboard of that puzzle.
 */

const DAY = 86_400_000

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A mode with no runs yet. */
function emptyMode(): StoredNumbersMode {
	return { scores: Array.from({ length: MAX_SCORE + 1 }, () => 0), daily: {} }
}

/** The stored document, with an empty mode for each mode that doesn't read as one. */
function stored(document: unknown): StoredNumbers {
	const modes = isRecord(document) ? document : {}

	const read = (mode: NumbersMode) => {
		const parsed = StoredNumbersModeSchema.safeParse(modes[mode])

		return parsed.success ? parsed.data : emptyMode()
	}

	return { solo: read('solo'), vsCpu: read('vsCpu') }
}

/** The day number of a `YYYYMMDD` date, counted from the epoch. */
function dayOf(date: string): number {
	return (
		Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6))) / DAY
	)
}

/**
 * Checks that the reader's date is within one day of the server's date, so a
 * reader can't count a daily puzzle ahead of its day. A reader in any time zone
 * is at most one day from UTC.
 */
function checkToday(today: string): void {
	if (Math.abs(dayOf(today) - Math.floor(Date.now() / DAY)) > 1) {
		throw new HTTPException(400, { message: "`today` must be within one day of the server's date" })
	}
}

/**
 * Checks that the date of a leaderboard is not ahead of the latest date that a
 * reader can have, one day ahead of the server's date.
 */
function checkNotAhead(date: string): void {
	if (dayOf(date) - Math.floor(Date.now() / DAY) > 1) {
		throw new HTTPException(400, { message: '`date` must not be ahead of the latest date' })
	}
}

/** The current streak, which ends today or yesterday, and the longest streak, of the dates of `daily`. */
function streaks(
	daily: Record<string, number>,
	today: string,
): { streak: number; bestStreak: number } {
	const days = new Set(Object.keys(daily).map(dayOf))

	let end = dayOf(today)

	if (!days.has(end)) end -= 1

	let streak = 0

	while (days.has(end - streak)) streak += 1

	let bestStreak = 0

	for (const day of days) {
		if (days.has(day - 1)) continue

		let length = 1

		while (days.has(day + length)) length += 1

		bestStreak = Math.max(bestStreak, length)
	}

	return { streak, bestStreak }
}

function modeStats(mode: StoredNumbersMode, today: string): NumbersModeStats {
	const played = mode.scores.reduce((sum, count) => sum + count, 0)

	const total = mode.scores.reduce((sum, count, score) => sum + count * score, 0)

	const best = mode.scores.findLastIndex((count) => count > 0)

	return {
		played,
		wins: mode.scores[MAX_SCORE] ?? 0,
		best: best === -1 ? null : best,
		average: played === 0 ? null : total / played,
		scores: mode.scores,
		...streaks(mode.daily, today),
	}
}

function stats(numbers: StoredNumbers, today: string): NumbersStats {
	return { solo: modeStats(numbers.solo, today), vsCpu: modeStats(numbers.vsCpu, today) }
}

/** The stats of each mode, with the streaks as of the reader's date `today`. */
export async function readNumbersStats(userId: string, today: string): Promise<NumbersStats> {
	checkToday(today)

	return stats(stored(await readDocument(userId, 'numbers')), today)
}

/** Every stored result of the user, for their export. */
export async function listNumbers(userId: string): Promise<StoredNumbers> {
	return stored(await readDocument(userId, 'numbers'))
}

/**
 * Counts one finished run, and answers with the new stats. A run whose seed is
 * the reader's date is the daily puzzle, and only its first run counts toward
 * the daily streak and the leaderboard.
 */
export async function recordNumbersResult(
	userId: string,
	result: NumbersResult,
): Promise<NumbersStats> {
	checkToday(result.today)

	return changeDocument(userId, 'numbers', async (document, tx) => {
		const numbers = stored(document)

		const mode = numbers[result.mode]

		const scores = mode.scores.map((count, score) => (score === result.score ? count + 1 : count))

		const first = result.seed === result.today && !(result.seed in mode.daily)

		if (first) {
			await recordDailyResult(tx, {
				game: 'numbers',
				mode: result.mode,
				date: result.seed,
				userId,
				score: result.score,
			})
		}

		const daily = first ? { ...mode.daily, [result.seed]: result.score } : mode.daily

		const next = { ...numbers, [result.mode]: { scores, daily } }

		return { result: stats(next, result.today), value: next }
	})
}

/**
 * The leaderboard of the daily puzzle of `date` in `mode`. A date ahead of the
 * date of every reader is refused, and an earlier date has its board.
 */
export function readNumbersBoard(
	userId: string,
	date: string,
	mode: NumbersMode,
): Promise<NumbersBoard> {
	checkNotAhead(date)

	return readDailyBoard('numbers', mode, date, userId)
}
