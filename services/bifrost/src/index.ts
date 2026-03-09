import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadEnv } from './lib/env.js'

const env = loadEnv()
const app = createApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Bifrost running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/api/docs`)
		console.log(`OpenAPI spec at http://localhost:${info.port}/openapi.json`)
	},
)

let shuttingDown = false

async function shutdown(signal: NodeJS.Signals) {
	if (shuttingDown) return

	shuttingDown = true

	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error)

				return
			}

			resolve()
		})
	})

	console.log(`Bifrost shut down after ${signal}`)

	process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, () => {
		void shutdown(signal).catch((error) => {
			console.error(`Failed to shut down Bifrost cleanly after ${signal}`, error)

			process.exit(1)
		})
	})
}
