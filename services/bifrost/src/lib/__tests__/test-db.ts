import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, type Db, migrate, sql } from 'saga'
import { startPostgres } from 'vali/containers'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

export interface TestDb {
	/** The handle to pass to the code under test. */
	db: Db
	/** Inserts a user, with a random email unless given one, and returns its id. */
	insertUser(options?: { email?: string; hashedPassword?: string }): Promise<string>
	/** Empties every table, so each test starts clean. */
	reset(): Promise<void>
	stop(): Promise<void>
}

/** Starts Postgres in a container with bifrost's migrations applied. */
export async function startTestDb(): Promise<TestDb> {
	const container = await startPostgres()

	const url = container.getConnectionUri()

	await migrate({ url }, migrationsDir)

	const db = createDb(() => ({ url }))

	return {
		db,

		insertUser({ email = `${randomUUID()}@x.dev`, hashedPassword = 'h' } = {}) {
			return db.val<string>(
				sql`INSERT INTO users (email, hashed_password) VALUES (${email}, ${hashedPassword}) RETURNING id`,
			)
		},

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

			await container.stop()
		},
	}
}
