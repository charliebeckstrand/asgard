import devServer from '@hono/vite-dev-server'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
	/*
	 * Loads all environment variables into process.env via Vite's `loadEnv(mode, '.', '')`,
	 * making them available throughout the Vite config before the server starts.
	 */
	Object.assign(process.env, loadEnv(mode, '.', ''))

	return {
		plugins: [
			tailwindcss(),
			devServer({
				entry: 'src/app.tsx',
				exclude: ['/src/client/**'],
			}),
		],
		server: {
			port: 3000,
		},
	}
})
