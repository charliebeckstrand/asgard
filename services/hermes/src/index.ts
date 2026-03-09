import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { createApp } from './app.js'
import { loadEnv } from './lib/env.js'
import { createWsHandler } from './ws/handler.js'

const env = loadEnv()

const app = createApp()
const nodeWs = createNodeWebSocket({ app })

app.get('/messages/ws', createWsHandler(nodeWs.upgradeWebSocket))

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Hermes running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/messages/docs`)
		console.log(`WebSocket at ws://localhost:${info.port}/messages/ws`)
	},
)

nodeWs.injectWebSocket(server)

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

	console.log(`Hermes shut down after ${signal}`)
	process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, () => {
		void shutdown(signal).catch((error) => {
			console.error(`Failed to shut down Hermes cleanly after ${signal}`, error)

			process.exit(1)
		})
	})
}
