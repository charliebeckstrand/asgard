import { vi } from 'vitest'

export const TEST_DATABASE_URL = 'postgres://test:test@localhost:5432/test'
export const TEST_CORS_ORIGIN = 'http://localhost:3000'

/**
 * Default env vars stubbed by {@link stubServiceEnv}. Caller-supplied
 * overrides take precedence; pass `null` to skip stubbing a particular var.
 */
export const TEST_SERVICE_ENV = {
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
