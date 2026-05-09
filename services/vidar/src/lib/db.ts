import { createDatabase, runMigrations } from 'saga'
import { environment } from './env.js'

export const { closePool, db } = createDatabase(() => environment().DATABASE_URL)

export async function migrate(migrationsDir: string): Promise<void> {
	// First call (no dir) bootstraps saga's own migrations table.
	await runMigrations(db)
	const result = await runMigrations(db, migrationsDir)

	if (result.applied.length > 0) {
		console.log(`[vidar] Applied migrations: ${result.applied.join(', ')}`)
	}
}
