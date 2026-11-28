import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate, sql } from 'saga'
import { startPostgresWithEnv } from 'vali/containers'
import { db } from '../lib/db.js'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')

/**
 * Starts Postgres in a container with Vidar's migrations applied, and points
 * `DATABASE_URL` at it, so the handlers' own `db` reaches it. Call before any
 * query: the pool reads the address on its first one. Returns the teardown.
 */
export async function startTestDb(): Promise<() => Promise<void>> {
	const stop = await startPostgresWithEnv()

	await migrate({ url: process.env.DATABASE_URL ?? '' }, migrationsDir)

	return async () => {
		await db.close()

		await stop()
	}
}

/** Empties every table, so each test starts clean. */
export async function resetTables(): Promise<void> {
	await db.exec(sql`TRUNCATE vdr_security_events, vdr_bans, vdr_threats`)
}

/** Stores `count` events of one type from `ip`, `minutesAgo` minutes old. */
export async function insertEvents(
	ip: string,
	eventType: string,
	count: number,
	options: { minutesAgo?: number; email?: (n: number) => string | undefined } = {},
): Promise<void> {
	const { minutesAgo = 0, email } = options

	for (let n = 0; n < count; n++) {
		const address = email?.(n)

		await db.exec(sql`
			INSERT INTO vdr_security_events (ip, event_type, details, service, created_at)
			VALUES (
				${ip},
				${eventType},
				${sql.json(address ? { email: address } : {})},
				'test',
				now() - make_interval(mins => ${minutesAgo}::int)
			)
		`)
	}
}
