import { execFileSync } from 'node:child_process'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

export type { StartedPostgreSqlContainer }

/**
 * Whether Docker answers, checked once per test file. Integration suites skip
 * without it, as in cloud sessions:
 *
 * @example
 * ```ts
 * describe.skipIf(!dockerAvailable)('widgets (integration)', () => { ... })
 * ```
 */
export const dockerAvailable = (() => {
	try {
		execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 5_000 })

		return true
	} catch {
		return false
	}
})()

/**
 * Starts Postgres in a container. Start it in a `beforeAll` with a 60 s
 * timeout, and stop it in `afterAll`.
 *
 * @example
 * ```ts
 * let container: StartedPostgreSqlContainer
 *
 * beforeAll(async () => {
 *   container = await startPostgres()
 * }, 60_000)
 *
 * afterAll(async () => {
 *   await container?.stop()
 * })
 * ```
 */
export function startPostgres(): Promise<StartedPostgreSqlContainer> {
	return new PostgreSqlContainer('postgres:18-alpine').start()
}
