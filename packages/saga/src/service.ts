import { createDatabase } from './db.js'
import { runMigrations } from './migrate.js'
import type { PoolOptions } from './pool.js'

export function bootstrapServiceDb(
	name: string,
	getDatabaseUrl: () => string,
	options?: PoolOptions,
) {
	const { db, closePool } = createDatabase(getDatabaseUrl, options)

	async function migrate(migrationsDir: string): Promise<void> {
		const result = await runMigrations(db, migrationsDir)

		if (result.applied.length > 0) {
			console.log(`[${name}] Applied migrations: ${result.applied.join(', ')}`)
		}
	}

	return { closePool, db, migrate }
}
