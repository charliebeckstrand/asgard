import { defineConfig } from 'tsup'

export default defineConfig({
	entry: { index: 'src/index.ts', client: 'src/client.ts' },
	format: ['esm'],
	target: 'node26',
	outDir: 'dist',
	clean: true,
	sourcemap: true,
	splitting: false,
})
