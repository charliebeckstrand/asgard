import { defineConfig } from 'tsup'

export default defineConfig([
	{
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
	},
	{
		entry: { 'form-handler': 'src/client/form-handler.ts' },
		format: ['iife'],
		target: 'es2022',
		outDir: 'dist',
		outExtension: () => ({ js: '.js' }),
		sourcemap: false,
		splitting: false,
		minify: true,
	},
])
