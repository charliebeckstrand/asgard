import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		fixtures: 'src/fixtures.ts',
		containers: 'src/containers.ts',
		config: 'src/config.ts',
		auth: 'src/auth.ts',
		env: 'src/env.ts',
	},
	format: ['esm'],
	target: 'node22',
	outDir: 'dist',
	clean: true,
	dts: true,
	sourcemap: true,
	splitting: false,
})
