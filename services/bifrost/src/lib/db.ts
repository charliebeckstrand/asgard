import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabase, runMigrations } from 'saga'
import { environment } from './env.js'

export const { closePool, db, getPool } = createDatabase(() => environment().DATABASE_URL)

// Walk up from the current file to find the package root (contains package.json).
// This works regardless of whether we're running from src/lib/ (dev) or dist/ (prod).
let migrationsDir = dirname(fileURLToPath(import.meta.url))
while (!existsSync(resolve(migrationsDir, 'package.json'))) {
	migrationsDir = dirname(migrationsDir)
}
migrationsDir = resolve(migrationsDir, 'migrations')

export async function migrate(): Promise<void> {
	await runMigrations(db)
	const result = await runMigrations(db, migrationsDir)

	if (result.applied.length > 0) {
		console.log(`[bifrost] Applied migrations: ${result.applied.join(', ')}`)
	}
}
