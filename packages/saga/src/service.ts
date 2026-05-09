import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabase, type Db } from './db.js'
import { runMigrations } from './migrate.js'
import type { PoolOptions } from './pool.js'

export function bootstrapServiceDb(
	name: string,
	getDatabaseUrl: () => string,
	options?: PoolOptions,
): {
	db: Db
	closePool: () => Promise<void>
	migrate: (callerModuleUrl: string) => Promise<void>
} {
	const { db, closePool } = createDatabase(getDatabaseUrl, options)

	/**
	 * Run migrations from `<service>/migrations`. Pass `import.meta.url` from
	 * the caller — saga resolves the migrations directory relative to it.
	 */
	async function migrate(callerModuleUrl: string): Promise<void> {
		const migrationsDir = resolve(dirname(fileURLToPath(callerModuleUrl)), '..', 'migrations')

		const result = await runMigrations(db, migrationsDir)

		if (result.applied.length > 0) {
			if (options?.logger) {
				options.logger.info({ migrations: result.applied }, 'applied migrations')
			} else {
				console.log(`[${name}] Applied migrations: ${result.applied.join(', ')}`)
			}
		}
	}

	return { closePool, db, migrate }
}
