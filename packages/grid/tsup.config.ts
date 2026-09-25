import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		auth: 'src/entry/auth.ts',
		middleware: 'src/entry/middleware.ts',
		environment: 'src/entry/environment.ts',
		manifest: 'src/entry/manifest.ts',
		'server-lifecycle': 'src/entry/server-lifecycle.ts',
	},
	format: ['esm'],
	target: 'node24',
	outDir: 'dist',
	clean: true,
	sourcemap: true,
	splitting: false,
})
