import { defineConfig } from 'tsup'

export default defineConfig({
	entry: { index: 'src/index.ts', client: 'src/client.ts' },
	format: ['esm'],
	target: 'node24',
	outDir: 'dist',
	clean: true,
	sourcemap: true,
	splitting: false,
})
