import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		fixtures: 'src/fixtures.ts',
		containers: 'src/containers.ts',
		config: 'src/config.ts',
		env: 'src/env.ts',
	},
	format: ['esm'],
	target: 'node26',
	outDir: 'dist',
	clean: true,
	sourcemap: true,
	splitting: false,
})
