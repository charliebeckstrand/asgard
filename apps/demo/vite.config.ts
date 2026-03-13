import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, '.', '')

	return {
		plugins: [react(), tailwindcss()],
		resolve: {
			alias: {
				'@': resolve(__dirname, 'src'),
			},
		},
		server: {
			port: 3000,
			proxy: {
				'/auth': {
					target: env.BIFROST_URL || 'http://localhost:4000',
					changeOrigin: true,
				},
				'/api': {
					target: env.BIFROST_URL || 'http://localhost:4000',
					changeOrigin: true,
				},
			},
		},
	}
})
