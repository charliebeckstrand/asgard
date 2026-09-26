import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		log: 'src/log/index.ts',
		saga: 'src/bin/saga.ts',
	},
	format: ['esm'],
	target: 'node24',
	outDir: 'dist',
	clean: true,
	sourcemap: true,
	splitting: false,
})
