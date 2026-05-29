import { execSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { vi } from 'vitest'

/**
 * Check if Docker is available and responsive.
 * Returns `true` if `docker info` succeeds, `false` otherwise.
 *
 * Use this to conditionally skip integration tests in environments
 * where Docker is not available (e.g., sandboxed CI runners).
 *
 * @example
 * ```ts
 * import { isDockerAvailable } from 'vali/containers'
 *
 * const describeWithDocker = isDockerAvailable() ? describe : describe.skip
 *
 * describeWithDocker('integration tests', () => { ... })
 * ```
 */
export function isDockerAvailable(): boolean {
	try {
		execSync('docker info', { stdio: 'ignore', timeout: 5_000 })

		return true
	} catch {
		return false
	}
}

export type TestDatabase = {
	/** The started PostgreSQL container instance */
	container: StartedPostgreSqlContainer

	/** The full connection URI (postgres://user:pass@host:port/db) */
	connectionUri: string

	/** Stop the container and clean up */
	stop: () => Promise<void>
}

/**
 * Starts a PostgreSQL testcontainer for integration testing.
 * Returns connection details and a cleanup function.
 *
 * Use in `beforeAll` / `afterAll` with a generous timeout:
 *
 * @example
 * ```ts
 * import { startPostgres } from 'vali/containers'
 * import { Pool } from 'pg'
 *
 * let testDb: TestDatabase
 * let pool: Pool
 *
 * beforeAll(async () => {
 *   testDb = await startPostgres()
 *   pool = new Pool({ connectionString: testDb.connectionUri })
 * }, 30_000)
 *
 * afterAll(async () => {
 *   await pool?.end()
 *   await testDb?.stop()
 * })
 * ```
 */
export async function startPostgres(
	options: { database?: string; username?: string; password?: string } = {},
): Promise<TestDatabase> {
	const { database = 'test', username = 'test', password = 'test' } = options

	const container = await new PostgreSqlContainer('postgres:16-alpine')
		.withDatabase(database)
		.withUsername(username)
		.withPassword(password)
		.start()

	return {
		container,
		connectionUri: container.getConnectionUri(),

		stop: async () => {
			await container.stop()
		},
	}
}

/**
 * Starts a PostgreSQL container and stubs the DATABASE_URL env var.
 * Combines `startPostgres()` with `vi.stubEnv()` for convenience.
 *
 * @example
 * ```ts
 * import { startPostgresWithEnv } from 'vali/containers'
 *
 * let cleanup: () => Promise<void>
 *
 * beforeAll(async () => {
 *   cleanup = await startPostgresWithEnv()
 * }, 30_000)
 *
 * afterAll(async () => {
 *   await cleanup()
 * })
 * ```
 */
export async function startPostgresWithEnv(
	options: Parameters<typeof startPostgres>[0] = {},
): Promise<() => Promise<void>> {
	const testDb = await startPostgres(options)

	vi.stubEnv('DATABASE_URL', testDb.connectionUri)

	return async () => {
		vi.unstubAllEnvs()

		await testDb.stop()
	}
}

/**
 * Minimal queryable interface compatible with `pg.Pool`, `pg.Client`, and
 * saga's `db`. Only `query(sql)` is required — the helper passes raw SQL
 * strings and ignores the return value.
 */
export interface MigrationsClient {
	query(sql: string): Promise<unknown>
}

/**
 * Apply every `*.sql` file in `migrationsDir` to `client`, in lexicographic
 * order. Designed for fresh test databases — no migration tracking, no
 * advisory locks. Each file is executed as one statement, so files may
 * contain multiple statements separated by semicolons.
 *
 * Returns the list of applied filenames in the order they were applied.
 *
 * @example
 * ```ts
 * import { Pool } from 'pg'
 * import { applyMigrations, startPostgres } from 'vali/containers'
 *
 * const testDb = await startPostgres()
 * const pool = new Pool({ connectionString: testDb.connectionUri })
 *
 * await applyMigrations(pool, new URL('../../migrations', import.meta.url).pathname)
 * ```
 */
export async function applyMigrations(
	client: MigrationsClient,
	migrationsDir: string,
): Promise<string[]> {
	const entries = await readdir(migrationsDir)

	const files = entries.filter((f) => f.endsWith('.sql')).sort()

	for (const file of files) {
		const sql = await readFile(join(migrationsDir, file), 'utf-8')

		await client.query(sql)
	}

	return files
}
