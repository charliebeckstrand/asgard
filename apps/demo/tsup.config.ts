import { defineConfig } from 'tsup'

export default defineConfig({
	entry: { index: 'src/index.ts' },
	format: ['esm'],
	target: 'node22',
	outDir: 'dist',
	clean: true,
	dts: true,
	sourcemap: true,
	splitting: false,
	jsx: 'automatic',
	jsxImportSource: 'hono/jsx',
})
