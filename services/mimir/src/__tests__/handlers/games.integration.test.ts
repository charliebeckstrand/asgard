import { copyFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDockerAvailable, startPostgres } from 'vali/containers'
import { stubServiceEnv } from 'vali/env'

stubServiceEnv()

const { holder } = vi.hoisted(() => ({ holder: {} as { db?: import('saga').Db } }))

vi.mock('../../lib/db.js', () => ({
	get db() {
		return holder.db
	},
}))

import { createDb, migrate, sql } from 'saga'
import {
	deleteGames,
	readDailyBoard,
	recordDailyResult,
	recordPlayerName,
} from '../../handlers/games.js'
import { recordNumbersResult } from '../../handlers/numbers.js'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

const DATE = '20261116'

/** The id of user `n`. */
const user = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** A first run of the daily puzzle of `DATE` in solo. */
const result = (n: number, score: number, date = DATE) => ({
	game: 'numbers' as const,
	mode: 'solo',
	date,
	userId: user(n),
	score,
})

/** The database, once the suite has started it. */
function database() {
	if (!holder.db) throw new Error('No database')

	return holder.db
}

/** Keeps a first run outside any other write. */
const record = (daily: ReturnType<typeof result>) => recordDailyResult(database(), daily)

/** Keeps the account name of user `n` outside any other write. */
const name = (n: number, value: string | null) => recordPlayerName(database(), user(n), value)

/** The name that the boards show for user `n`, or null. */
const nameOf = async (n: number) =>
	(
		await database().first<{ name: string }>(
			sql`SELECT name FROM game_players WHERE user_id = ${user(n)}`,
		)
	)?.name ?? null

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('games', () => {
	let stop: () => Promise<unknown>

	beforeAll(async () => {
		const container = await startPostgres()

		holder.db = createDb(() => ({ url: container.connectionUri, max: 10 }))

		stop = () => container.stop()

		// The documents of before the games tables, which their migration copies.
		const first = await mkdtemp(join(tmpdir(), 'mimir-migrations-'))

		await copyFile(
			join(migrationsDir, '0001_create_documents.sql'),
			join(first, '0001_create_documents.sql'),
		)

		await migrate({ url: container.connectionUri }, first)

		const stored = {
			solo: { scores: [], daily: { 20261114: 9, 20261115: 20 } },
			vsCpu: { scores: [], daily: { 20261115: 3 } },
		}

		await holder.db.exec(sql`
			INSERT INTO documents (user_id, name, value) VALUES
				(${user(90)}, 'numbers', ${sql.json(stored)}::jsonb),
				(${user(91)}, 'numbers', ${sql.json({ solo: 'broken', vsCpu: { daily: [] } })}::jsonb),
				(${user(92)}, 'places', ${sql.json({ solo: { daily: { 20261115: 1 } } })}::jsonb)
		`)

		await migrate({ url: container.connectionUri }, migrationsDir)
	}, 60_000)

	afterAll(async () => {
		await holder.db?.close()

		await stop?.()
	})

	beforeEach(async () => {
		await holder.db?.exec(sql`DELETE FROM game_results WHERE day = to_date(${DATE}, 'YYYYMMDD')`)

		await holder.db?.exec(sql`DELETE FROM game_players`)
	})

	it('copies the daily scores of the numbers documents', async () => {
		const rows = await holder.db?.many(sql`
			SELECT mode, to_char(day, 'YYYYMMDD') AS date, user_id, score
			FROM game_results ORDER BY mode, day
		`)

		expect(rows).toEqual([
			{ mode: 'solo', date: '20261114', user_id: user(90), score: 9 },
			{ mode: 'solo', date: '20261115', user_id: user(90), score: 20 },
			{ mode: 'vsCpu', date: '20261115', user_id: user(90), score: 3 },
		])
	})

	it('ranks the players of one date by score, with equal scores sharing a rank', async () => {
		await record(result(1, 12))

		await record(result(2, 15))

		await record(result(3, 12))

		await record(result(4, 20, '20261117'))

		await record({ ...result(5, 19), mode: 'vsCpu' })

		await name(2, 'Ada')

		expect(await readDailyBoard('numbers', 'solo', DATE, user(3))).toEqual({
			players: 3,
			entries: [
				{ rank: 1, name: 'Ada', score: 15, you: false },
				{ rank: 2, name: null, score: 12, you: false },
				{ rank: 2, name: null, score: 12, you: true },
			],
		})
	})

	it('keeps the first score of a player', async () => {
		await record(result(1, 4))

		await record(result(1, 18))

		expect(await readDailyBoard('numbers', 'solo', DATE, user(1))).toEqual({
			players: 1,
			entries: [{ rank: 1, name: null, score: 4, you: true }],
		})
	})

	it('shows the top 10, then the reader when they are below them', async () => {
		for (let n = 1; n <= 12; n++) await record(result(n, 21 - n))

		const below = await readDailyBoard('numbers', 'solo', DATE, user(12))

		expect(below.players).toBe(12)

		expect(below.entries.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12])

		expect(below.entries.at(-1)).toEqual({ rank: 12, name: null, score: 9, you: true })

		const inside = await readDailyBoard('numbers', 'solo', DATE, user(3))

		expect(inside.entries).toHaveLength(10)

		expect(inside.entries.filter((entry) => entry.you)).toEqual([
			{ rank: 3, name: null, score: 18, you: true },
		])
	})

	it('reads a date with no players as an empty board', async () => {
		expect(await readDailyBoard('numbers', 'solo', '20260101', user(1))).toEqual({
			players: 0,
			entries: [],
		})
	})

	it('keeps, changes and removes the name of an account', async () => {
		expect(await nameOf(1)).toBeNull()

		await name(1, 'Ada')

		await name(1, 'Grace')

		expect(await nameOf(1)).toBe('Grace')

		await name(1, null)

		expect(await nameOf(1)).toBeNull()
	})

	it('keeps the first run of a daily puzzle and the account name with the run that counts it', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })

		vi.setSystemTime(new Date('2026-11-16T12:00:00Z'))

		const run = { seed: DATE, mode: 'solo' as const, today: DATE }

		try {
			await recordNumbersResult(user(7), 'Lin', { ...run, score: 6 })

			await recordNumbersResult(user(7), 'Lin', { ...run, score: 17 })
		} finally {
			vi.useRealTimers()
		}

		expect(await readDailyBoard('numbers', 'solo', DATE, user(7))).toEqual({
			players: 1,
			entries: [{ rank: 1, name: 'Lin', score: 6, you: true }],
		})
	})

	it("deletes the results and the name of the user and no one else's", async () => {
		await record(result(1, 10))

		await record(result(2, 11))

		await name(1, 'Ada')

		await name(2, 'Grace')

		await deleteGames(user(1))

		expect(await nameOf(1)).toBeNull()

		expect(await nameOf(2)).toBe('Grace')

		expect(await readDailyBoard('numbers', 'solo', DATE, user(1))).toEqual({
			players: 1,
			entries: [{ rank: 1, name: 'Grace', score: 11, you: false }],
		})
	})
})
