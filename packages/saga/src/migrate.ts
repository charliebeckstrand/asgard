import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Db, Queryable } from './db.js'
import { sql } from './sql.js'

interface MigrationRecord {
	name: string
	applied_at: string
}

export interface MigrationResult {
	applied: string[]
	skipped: string[]
}

/**
 * Stable advisory-lock key — bytes of "saga" interpreted as int32 (0x53616761).
 * Concurrent runMigrations calls across processes serialize on this key, so
 * rolling deploys that overlap can't race each other into duplicate-key errors.
 */
const MIGRATION_LOCK_KEY = 0x53616761

async function ensureSagaSchema(q: Queryable): Promise<void> {
	await q.exec(sql`
		CREATE SCHEMA IF NOT EXISTS saga
	`)

	await q.exec(sql`
		CREATE TABLE IF NOT EXISTS saga.migrations (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`)
}

async function getAppliedMigrations(db: Db): Promise<MigrationRecord[]> {
	return db.many<MigrationRecord>(sql`
		SELECT name, applied_at::text AS applied_at
		FROM saga.migrations
		ORDER BY name
	`)
}

async function readMigrationFiles(migrationsDir: string): Promise<string[]> {
	const files = await readdir(migrationsDir)

	return files.filter((f) => f.endsWith('.sql')).sort()
}

export async function runMigrations(db: Db, migrationsDir: string): Promise<MigrationResult> {
	// Serialize schema bootstrap under the same advisory lock as per-migration
	// application. CREATE SCHEMA IF NOT EXISTS doesn't actually serialize at
	// the pg_namespace catalog level — under concurrent boots two transactions
	// can both pass the existence check and then race the unique constraint.
	await db.tx(async (tx) => {
		await tx.exec(sql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY}::bigint)`)

		await ensureSagaSchema(tx)
	})

	const applied = new Set((await getAppliedMigrations(db)).map((r) => r.name))

	const files = await readMigrationFiles(migrationsDir)

	const result: MigrationResult = { applied: [], skipped: [] }

	for (const file of files) {
		if (applied.has(file)) {
			result.skipped.push(file)

			continue
		}

		const content = await readFile(join(migrationsDir, file), 'utf-8')

		const wasAppliedThisCall = await db.tx(async (tx) => {
			await tx.exec(sql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY}::bigint)`)

			// Re-check under the lock — another process may have applied this
			// migration between our pre-loop read and acquiring the lock.
			const existing = await tx.first<{ name: string }>(sql`
				SELECT name FROM saga.migrations WHERE name = ${file}
			`)

			if (existing) return false

			await tx.exec(sql.raw(content))

			await tx.exec(sql`
				INSERT INTO saga.migrations (name)
				VALUES (${file})
			`)

			return true
		})

		if (wasAppliedThisCall) {
			result.applied.push(file)
		} else {
			result.skipped.push(file)
		}
	}

	return result
}
