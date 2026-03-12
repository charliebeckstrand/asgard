import devServer from '@hono/vite-dev-server'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		devServer({
			entry: 'src/app.tsx',
		}),
	],
	server: {
		port: 3000,
	},
})
