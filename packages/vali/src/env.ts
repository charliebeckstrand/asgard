import { vi } from 'vitest'

/**
 * Standard test secrets — long enough to satisfy length validators (32+ chars).
 * Keep these stable so the same value drives both env stubbing and JWT signing
 * in the same test file.
 */
export const TEST_SECRET_KEY = 'test-secret-key-that-is-at-least-32-chars-long'
export const TEST_SESSION_SECRET = 'test-session-secret-that-is-32-chars-long'
export const TEST_DATABASE_URL = 'postgres://test:test@localhost:5432/test'
export const TEST_CORS_ORIGIN = 'http://localhost:3000'

/**
 * Default env vars stubbed by {@link stubServiceEnv}. Caller-supplied
 * overrides take precedence; pass `null` to skip stubbing a particular var.
 */
export const TEST_SERVICE_ENV = {
	SECRET_KEY: TEST_SECRET_KEY,
	SESSION_SECRET: TEST_SESSION_SECRET,
	DATABASE_URL: TEST_DATABASE_URL,
	CORS_ORIGIN: TEST_CORS_ORIGIN,
} as const

/**
 * Stub the standard set of service env vars in one call. Returns nothing —
 * Vitest unstubs automatically on teardown when `unstubEnvs` is enabled in
 * config, but explicit `vi.unstubAllEnvs()` in afterEach is also fine.
 *
 * Call at module scope (before any `import` of code that reads `process.env`)
 * so the stubs are active during module evaluation.
 *
 * @example
 * ```ts
 * import { stubServiceEnv } from 'vali/env'
 *
 * stubServiceEnv()
 * // …or override individual vars:
 * stubServiceEnv({ CORS_ORIGIN: 'http://localhost:4000' })
 *
 * import { createBifrostApp } from '../app.js'
 * ```
 */
export function stubServiceEnv(overrides: Partial<Record<string, string | null>> = {}): void {
	for (const [key, defaultValue] of Object.entries(TEST_SERVICE_ENV)) {
		const override = overrides[key]

		if (override === null) continue

		vi.stubEnv(key, override ?? defaultValue)
	}

	for (const [key, value] of Object.entries(overrides)) {
		if (key in TEST_SERVICE_ENV) continue

		if (value === null || value === undefined) continue

		vi.stubEnv(key, value)
	}
}
