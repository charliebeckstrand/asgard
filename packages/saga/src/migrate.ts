import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Db } from './db.js'
import { sql } from './sql.js'

interface MigrationRecord {
	name: string
	applied_at: string
}

export interface MigrationResult {
	applied: string[]
	skipped: string[]
}

async function ensureSagaSchema(db: Db): Promise<void> {
	await db.exec(sql`
		CREATE SCHEMA IF NOT EXISTS saga
	`)

	await db.exec(sql`
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
	await ensureSagaSchema(db)

	const applied = new Set((await getAppliedMigrations(db)).map((r) => r.name))
	const files = await readMigrationFiles(migrationsDir)

	const result: MigrationResult = { applied: [], skipped: [] }

	for (const file of files) {
		if (applied.has(file)) {
			result.skipped.push(file)

			continue
		}

		const content = await readFile(join(migrationsDir, file), 'utf-8')

		await db.tx(async (tx) => {
			await tx.exec(sql.raw(content))

			await tx.exec(sql`
				INSERT INTO saga.migrations (name)
				VALUES (${file})
			`)
		})

		result.applied.push(file)
	}

	return result
}
