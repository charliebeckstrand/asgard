import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		matchers: 'src/matchers/index.ts',
		mocks: 'src/mocks/index.ts',
		fixtures: 'src/fixtures/index.ts',
		setup: 'src/setup.ts',
		containers: 'src/containers/index.ts',
		config: 'src/config.ts',
	},
	format: ['esm'],
	target: 'node22',
	outDir: 'dist',
	clean: true,
	dts: true,
	sourcemap: true,
	splitting: false,
})
