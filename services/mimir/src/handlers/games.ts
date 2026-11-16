import { type Queryable, sql } from 'saga'
import { db } from '../lib/db.js'
import type { NumbersBoard } from '../lib/schemas.js'

/**
 * What every game keeps outside the documents of its users, for the reads
 * across users that a document can't serve: the best score of each user on each
 * daily puzzle, a row of `game_results`, and the name of the account of each
 * user, which the leaderboards show, a row of `game_players`.
 */

/** The games with daily puzzles. */
type Game = 'numbers'

/** The rows that a leaderboard shows above the row of the reader. */
const BOARD_SIZE = 10

/** The score of one run of a daily puzzle on its day. `date` is `YYYYMMDD`. */
type DailyResult = { game: Game; mode: string; date: string; userId: string; score: number }

/**
 * Keeps the best score of the user on a daily puzzle, in the transaction `q` of
 * the write that counts the run. A run with a higher score replaces the score,
 * and its time orders the ties. A run with an equal or lower score changes
 * nothing.
 */
export async function recordDailyResult(q: Queryable, result: DailyResult): Promise<void> {
	await q.exec(sql`
		INSERT INTO game_results (game, mode, day, user_id, score)
		VALUES (
			${result.game}, ${result.mode}, to_date(${result.date}, 'YYYYMMDD'), ${result.userId},
			${result.score}
		)
		ON CONFLICT (game, mode, day, user_id) DO UPDATE
			SET score = EXCLUDED.score, created_at = now()
			WHERE EXCLUDED.score > game_results.score
	`)
}

type BoardRow = { rank: number; name: string | null; score: number; you: boolean; players: number }

/**
 * The leaderboard of one daily puzzle: the first {@link BOARD_SIZE} players by
 * best score, then the reader `userId` when they are below them. A reader with no
 * session (`null`) gets only the first players, and no entry is theirs. Equal
 * scores share a rank, and list in the order that the players got them.
 */
export async function readDailyBoard(
	game: Game,
	mode: string,
	date: string,
	userId: string | null,
): Promise<NumbersBoard> {
	const rows = await db.many<BoardRow>(sql`
		WITH ranked AS (
			SELECT
				results.user_id,
				results.score,
				players.name,
				rank() OVER (ORDER BY results.score DESC)::int AS rank,
				row_number() OVER (
					ORDER BY results.score DESC, results.created_at, results.user_id
				) AS place,
				count(*) OVER ()::int AS players
			FROM game_results AS results
			LEFT JOIN game_players AS players ON players.user_id = results.user_id
			WHERE results.game = ${game}
				AND results.mode = ${mode}
				AND results.day = to_date(${date}, 'YYYYMMDD')
		)
		SELECT rank, name, score, user_id IS NOT DISTINCT FROM ${userId} AS you, players
		FROM ranked
		WHERE place <= ${BOARD_SIZE} OR user_id = ${userId}
		ORDER BY place
	`)

	return {
		players: rows[0]?.players ?? 0,
		entries: rows.map(({ rank, name, score, you }) => ({ rank, name, score, you })),
	}
}

/**
 * Keeps the name of the account of the user, which the leaderboards show, in
 * the transaction `q` of the write that counts a run. An account with no name
 * has no row, and shows as anonymous.
 */
export async function recordPlayerName(
	q: Queryable,
	userId: string,
	name: string | null,
): Promise<void> {
	if (name === null) {
		await q.exec(sql`DELETE FROM game_players WHERE user_id = ${userId}`)

		return
	}

	await q.exec(sql`
		INSERT INTO game_players (user_id, name)
		VALUES (${userId}, ${name})
		ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
		WHERE game_players.name IS DISTINCT FROM EXCLUDED.name
	`)
}

/** Deletes the results and the name of the user, for when their account is deleted. */
export async function deleteGames(userId: string): Promise<void> {
	await db.tx(async (tx) => {
		await tx.exec(sql`DELETE FROM game_results WHERE user_id = ${userId}`)

		await tx.exec(sql`DELETE FROM game_players WHERE user_id = ${userId}`)
	})
}
