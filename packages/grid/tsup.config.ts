import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		schemas: 'src/entry-schemas.ts',
		middleware: 'src/entry-middleware.ts',
		environment: 'src/entry-environment.ts',
	},
	format: ['esm'],
	target: 'node22',
	outDir: 'dist',
	clean: true,
	dts: true,
	sourcemap: true,
	splitting: false,
})
