import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		fixtures: 'src/fixtures.ts',
		containers: 'src/containers.ts',
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
