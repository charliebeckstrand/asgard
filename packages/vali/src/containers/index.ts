import { execSync } from 'node:child_process'
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
 * import { createDatabaseClient } from 'saga'
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
