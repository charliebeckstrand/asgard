import { defineConfig } from 'vitest/config'

/** The Vitest config of every package and service: `export { default } from 'vali/config'`. */
export default defineConfig({
	test: {
		globals: true,
		passWithNoTests: true,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/__tests__/**'],
		},
	},
})
