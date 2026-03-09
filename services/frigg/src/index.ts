import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadEnv } from './lib/env.js'
import { loadEnvironments } from './lib/environments.js'

const env = loadEnv()

// Pre-load environments at startup to fail fast if the file is missing
const environments = loadEnvironments()

const serviceCount = Object.keys(environments).length

const app = createApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Frigg running on http://localhost:${info.port}`)
		console.log(`${serviceCount} services loaded from ${env.NODE_ENV} environment`)
		console.log(`API docs available at http://localhost:${info.port}/services/docs`)
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

	console.log(`Frigg shut down after ${signal}`)

	process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, () => {
		void shutdown(signal).catch((error) => {
			console.error(`Failed to shut down Frigg cleanly after ${signal}`, error)

			process.exit(1)
		})
	})
}
