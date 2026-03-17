import { createDatabase, runMigrations } from 'saga'
import { environment } from './env.js'

export const { closePool, db, getPool } = createDatabase(() => environment().DATABASE_URL)

export async function migrate(migrationsDir: string): Promise<void> {
	await runMigrations(db)
	const result = await runMigrations(db, migrationsDir)

	if (result.applied.length > 0) {
		console.log(`[bifrost] Applied migrations: ${result.applied.join(', ')}`)
	}
}
