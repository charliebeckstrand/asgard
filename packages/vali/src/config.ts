import { defineConfig } from 'vitest/config'

type CoverageInclude = string[]

/**
 * Creates a shared Vitest config with sensible defaults for the monorepo.
 *
 * @example
 * ```ts
 * // vitest.config.ts
 * export { default } from 'vali/config'
 * ```
 *
 * @example
 * ```ts
 * // vitest.config.ts (with overrides)
 * import { createVitestConfig } from 'vali/config'
 *
 * export default createVitestConfig({
 *   coverage: { include: ['src/**\/*.{ts,tsx}'] },
 * })
 * ```
 */
export function createVitestConfig(overrides: { coverage?: { include?: CoverageInclude } } = {}) {
	return defineConfig({
		test: {
			globals: true,
			environment: 'node',
			passWithNoTests: true,
			coverage: {
				provider: 'v8',
				include: overrides.coverage?.include ?? ['src/**/*.ts'],
				exclude: ['src/__tests__/**'],
			},
		},
		resolve: {
			alias: {
				'@': './src',
			},
		},
	})
}

export default createVitestConfig()
