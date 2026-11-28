import { vi } from 'vitest'

export const TEST_DATABASE_URL = 'postgres://test:test@localhost:5432/test'
export const TEST_APP_ORIGINS = 'http://localhost:3000'

const TEST_SERVICE_ENV = {
	DATABASE_URL: TEST_DATABASE_URL,
	APP_ORIGINS: TEST_APP_ORIGINS,
}

/**
 * Stubs `DATABASE_URL` and `APP_ORIGINS` with test values, plus any `overrides`,
 * which win. An override of `null` leaves that variable alone. Undo with
 * `vi.unstubAllEnvs()`.
 *
 * Call it before importing code that reads `process.env` as it loads.
 *
 * @example
 * ```ts
 * import { stubServiceEnv } from 'vali/env'
 *
 * stubServiceEnv({ APP_ORIGINS: 'http://localhost:4000' })
 *
 * import { createBifrostApp } from '../app.js'
 * ```
 */
export function stubServiceEnv(overrides: Record<string, string | null> = {}): void {
	for (const [key, value] of Object.entries({ ...TEST_SERVICE_ENV, ...overrides })) {
		if (value !== null) vi.stubEnv(key, value)
	}
}
