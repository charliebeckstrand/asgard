import { HTTPException } from 'grid'
import {
	MAX_SCORE,
	type NumbersBoard,
	type NumbersBoardMode,
	type NumbersMode,
	type NumbersModeStats,
	type NumbersResult,
	type NumbersStats,
	type StoredNumbers,
	type StoredNumbersMode,
	StoredNumbersModeSchema,
} from '../lib/schemas.js'
import { changeDocument, readDocument } from './documents.js'
import { readDailyBoard, recordDailyResult, recordPlayerName } from './games.js'

/**
 * The results of the numbers app of each user, in one document. For each mode,
 * the count of runs that ended on each score. Vs CPU also counts the runs that
 * came with an outcome and the runs of those that beat the CPU. Every other
 * stat comes from these on read. Each run also goes to `game_results`, in the
 * same transaction, which keeps the best score of the user on each leaderboard
 * of each day.
 */

const DAY = 86_400_000

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A mode with no runs yet. */
function emptyMode(): StoredNumbersMode {
	return { scores: Array.from({ length: MAX_SCORE + 1 }, () => 0) }
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
 * reader can't count a run on the board of another day. A reader in any time
 * zone is at most one day from UTC.
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

function modeStats(mode: StoredNumbersMode): NumbersModeStats {
	const played = mode.scores.reduce((sum, count) => sum + count, 0)

	const total = mode.scores.reduce((sum, count, score) => sum + count * score, 0)

	const best = mode.scores.findLastIndex((count) => count > 0)

	return {
		played,
		wins: mode.scores[MAX_SCORE] ?? 0,
		best: best === -1 ? null : best,
		average: played === 0 ? null : total / played,
		scores: mode.scores,
		winRate: mode.cpu?.played ? mode.cpu.beat / mode.cpu.played : null,
	}
}

function stats(numbers: StoredNumbers): NumbersStats {
	return { solo: modeStats(numbers.solo), vsCpu: modeStats(numbers.vsCpu) }
}

/** The stats of each mode. */
export async function readNumbersStats(userId: string): Promise<NumbersStats> {
	return stats(stored(await readDocument(userId, 'numbers')))
}

/** Every stored result of the user, for their export. */
export async function listNumbers(userId: string): Promise<StoredNumbers> {
	return stored(await readDocument(userId, 'numbers'))
}

/**
 * The leaderboard that a run counts on: `solo` for a solo run, and `vsCpu` for
 * a run that beat the CPU. A vs CPU run that tied or lost counts on no
 * leaderboard, and the answer is `null`.
 */
function boardOf(result: NumbersResult): NumbersBoardMode | null {
	if (result.mode === 'vsCpu') return result.beatCpu ? 'vsCpu' : null

	return 'solo'
}

/**
 * Counts one finished run, and answers with the new stats. A run counts on its
 * leaderboard of the reader's date, if it has one (see {@link boardOf}).
 * `name` is the name of the account, which the leaderboards show.
 */
export async function recordNumbersResult(
	userId: string,
	name: string | null,
	result: NumbersResult,
): Promise<NumbersStats> {
	checkToday(result.today)

	return changeDocument(userId, 'numbers', async (document, tx) => {
		await recordPlayerName(tx, userId, name)

		const numbers = stored(document)

		const mode = numbers[result.mode]

		const scores = mode.scores.map((count, score) => (score === result.score ? count + 1 : count))

		const board = boardOf(result)

		if (board) {
			await recordDailyResult(tx, {
				game: 'numbers',
				mode: board,
				date: result.today,
				userId,
				score: result.score,
			})
		}

		// A run from an app before `beatCpu` has no outcome, so it does not count
		// toward the share of wins.
		const cpu =
			result.mode === 'vsCpu' && result.beatCpu !== undefined
				? {
						played: (mode.cpu?.played ?? 0) + 1,
						beat: (mode.cpu?.beat ?? 0) + (result.beatCpu ? 1 : 0),
					}
				: mode.cpu

		const next = { ...numbers, [result.mode]: { scores, ...(cpu && { cpu }) } }

		return { result: stats(next), value: next }
	})
}

/**
 * The leaderboard `mode` of the day `date`, as the reader
 * `userId` sees it, or as a reader with no session with `null`. A date ahead of
 * the date of every reader is refused, and an earlier date has its board.
 */
export function readNumbersBoard(
	userId: string | null,
	date: string,
	mode: NumbersBoardMode,
): Promise<NumbersBoard> {
	checkNotAhead(date)

	return readDailyBoard('numbers', mode, date, userId)
}
