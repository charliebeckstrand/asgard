import { defineConfig } from 'tsup'

export default defineConfig({
	entry: { index: 'src/index.ts', client: 'src/client.ts' },
	format: ['esm'],
	target: 'node22',
	outDir: 'dist',
	clean: true,
	dts: true,
	sourcemap: true,
	splitting: false,
})
