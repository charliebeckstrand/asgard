import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { createDb, type Db, migrate, sql } from 'saga'
import { startPostgres } from 'vali/containers'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

export interface TestDb {
	/** The handle to pass to the code under test. */
	db: Db
	/** Plain node-postgres, for tests that arrange or check rows with raw SQL. */
	pool: Pool
	/** Empties every table, so each test starts clean. */
	reset(): Promise<void>
	stop(): Promise<void>
}

/** Starts Postgres in a container with bifrost's migrations applied. */
export async function startTestDb(): Promise<TestDb> {
	const container = await startPostgres()

	await migrate({ url: container.connectionUri }, migrationsDir)

	const db = createDb(() => ({ url: container.connectionUri }))

	const pool = new Pool({ connectionString: container.connectionUri })

	return {
		db,
		pool,

		async reset() {
			await db.exec(sql`
				DO $$ BEGIN
					EXECUTE (
						SELECT 'TRUNCATE ' || string_agg(format('%I', tablename), ', ') || ' CASCADE'
						FROM pg_tables
						WHERE schemaname = 'public'
					);
				END $$
			`)
		},

		async stop() {
			await db.close()

			await pool.end()

			await container.stop()
		},
	}
}
