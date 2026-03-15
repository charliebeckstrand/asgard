import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabase, runMigrations, runSagaMigrations } from 'saga'
import { environment } from './env.js'

export const { closePool, db, getPool } = createDatabase(() => environment().DATABASE_URL)

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

export async function migrate(): Promise<void> {
	await runSagaMigrations(db)
	const result = await runMigrations(db, migrationsDir)

	if (result.applied.length > 0) {
		console.log(`[vidar] Applied migrations: ${result.applied.join(', ')}`)
	}
}
