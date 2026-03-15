import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabase, runMigrations } from 'saga'
import { environment } from './env.js'

export const { closePool, db, getPool } = createDatabase(() => environment().DATABASE_URL)

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations')

export async function migrate(): Promise<void> {
	await runMigrations(db)
	const result = await runMigrations(db, migrationsDir)

	if (result.applied.length > 0) {
		console.log(`[bifrost] Applied migrations: ${result.applied.join(', ')}`)
	}
}
