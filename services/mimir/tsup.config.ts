import { defineConfig } from 'tsup'

export default defineConfig({
	entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
	format: ['esm'],
	target: 'node26',
	outDir: 'dist',
	clean: true,
	sourcemap: true,
	splitting: false,
})
