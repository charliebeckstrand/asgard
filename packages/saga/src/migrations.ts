import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Client } from 'pg'
import { type ConnectionOptions, connectionConfig } from './connection.js'

/**
 * Migrations are SQL files named `NNNN_name.sql`, applied once each, in order,
 * and recorded in `saga.migrations` with a checksum so an edit to an applied
 * file is caught instead of silently diverging from the database.
 */

export interface Migration {
	name: string
	checksum: string
	sql: string
}

export interface MigrationStatus {
	name: string
	/** `changed`: applied, but the file differs. `missing`: applied, but the file is gone. */
	state: 'applied' | 'pending' | 'changed' | 'missing'
}

interface AppliedMigration {
	name: string
	checksum: string | null
}

export class MigrationError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options)

		this.name = 'MigrationError'
	}
}

const FILE_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/

/** Bytes of "saga" as an int32; every migration run in a database holds this lock. */
const LOCK_KEY = 0x53616761

function checksum(sql: string): string {
	return createHash('sha256').update(sql).digest('hex')
}

/** The migration files in `dir`, in order. Throws on a misnamed file or a reused number. */
export async function readMigrations(dir: string): Promise<Migration[]> {
	const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()

	const numbers = new Map<string, string>()

	for (const name of names) {
		const number = FILE_NAME.exec(name)?.[1]

		if (!number) {
			throw new MigrationError(`${name} must be named NNNN_name.sql in lowercase`)
		}

		const other = numbers.get(number)

		if (other) {
			throw new MigrationError(`${other} and ${name} share the number ${number}`)
		}

		numbers.set(number, name)
	}

	return Promise.all(
		names.map(async (name) => {
			const sql = await readFile(join(dir, name), 'utf-8')

			return { name, checksum: checksum(sql), sql }
		}),
	)
}

/** Compares the files with what the database has applied. */
export function compare(files: Migration[], applied: AppliedMigration[]): MigrationStatus[] {
	const recorded = new Map(applied.map((m) => [m.name, m.checksum]))

	const onDisk = new Set(files.map((m) => m.name))

	const statuses: MigrationStatus[] = files.map(({ name, checksum }) => {
		if (!recorded.has(name)) return { name, state: 'pending' }

		const stored = recorded.get(name)

		// Rows from before checksums were recorded match whatever is on disk.
		return { name, state: stored === null || stored === checksum ? 'applied' : 'changed' }
	})

	const missing: MigrationStatus[] = applied
		.filter((m) => !onDisk.has(m.name))
		.map(({ name }) => ({ name, state: 'missing' }))

	return [...statuses, ...missing].sort((a, b) => a.name.localeCompare(b.name))
}

async function connect(connection: ConnectionOptions): Promise<Client> {
	const client = new Client({ ...connectionConfig(connection), application_name: 'saga' })

	await client.connect()

	return client
}

async function readApplied(client: Client): Promise<AppliedMigration[]> {
	// Read through jsonb so a table from before checksums, which `status` doesn't
	// alter, reads as having none.
	const { rows } = await client.query<AppliedMigration>(
		"SELECT name, to_jsonb(m) ->> 'checksum' AS checksum FROM saga.migrations m ORDER BY name",
	)

	return rows
}

/**
 * Applies the pending migrations in `dir`, each in its own transaction, and
 * returns their names. One run at a time per database: a second waits for the
 * first. Refuses to start while an applied migration's file has changed.
 */
export async function migrate(connection: ConnectionOptions, dir: string): Promise<string[]> {
	const files = await readMigrations(dir)

	const client = await connect(connection)

	try {
		await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])

		await client.query('CREATE SCHEMA IF NOT EXISTS saga')

		await client.query(`
			CREATE TABLE IF NOT EXISTS saga.migrations (
				id SERIAL PRIMARY KEY,
				name TEXT NOT NULL UNIQUE,
				applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
			)
		`)

		await client.query('ALTER TABLE saga.migrations ADD COLUMN IF NOT EXISTS checksum TEXT')

		const recorded = await readApplied(client)

		const statuses = compare(files, recorded)

		const changed = statuses.filter((s) => s.state === 'changed').map((s) => s.name)

		if (changed.length > 0) {
			throw new MigrationError(
				`Applied migrations were edited: ${changed.join(', ')}. Restore them and add a new migration instead.`,
			)
		}

		// Record checksums for rows applied before saga kept them.
		for (const file of files) {
			if (recorded.some((m) => m.name === file.name && m.checksum === null)) {
				await client.query('UPDATE saga.migrations SET checksum = $2 WHERE name = $1', [
					file.name,
					file.checksum,
				])
			}
		}

		const pending = new Set(statuses.filter((s) => s.state === 'pending').map((s) => s.name))

		const applied: string[] = []

		for (const file of files.filter((m) => pending.has(m.name))) {
			try {
				await client.query('BEGIN')

				await client.query(file.sql)

				await client.query('INSERT INTO saga.migrations (name, checksum) VALUES ($1, $2)', [
					file.name,
					file.checksum,
				])

				await client.query('COMMIT')
			} catch (err) {
				await client.query('ROLLBACK')

				throw new MigrationError(`${file.name} failed: ${(err as Error).message}`, { cause: err })
			}

			applied.push(file.name)
		}

		return applied
	} finally {
		// Ending the session releases the lock.
		await client.end()
	}
}

/** Each migration in `dir` or recorded in the database, and whether it's applied. */
export async function migrationStatus(
	connection: ConnectionOptions,
	dir: string,
): Promise<MigrationStatus[]> {
	const files = await readMigrations(dir)

	const client = await connect(connection)

	try {
		const { rows } = await client.query<{ exists: boolean }>(
			"SELECT to_regclass('saga.migrations') IS NOT NULL AS exists",
		)

		return compare(files, rows[0].exists ? await readApplied(client) : [])
	} finally {
		await client.end()
	}
}

/** Writes an empty migration numbered after the last one and returns its file name. */
export async function createMigration(dir: string, description: string): Promise<string> {
	const slug = description
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '')

	if (!slug) {
		throw new MigrationError('A migration needs a name, like "add_user_names"')
	}

	const files = await readMigrations(dir)

	const last = files.at(-1)?.name.slice(0, 4) ?? '0000'

	const name = `${String(Number(last) + 1).padStart(4, '0')}_${slug}.sql`

	await writeFile(join(dir, name), '', { flag: 'wx' })

	return name
}
