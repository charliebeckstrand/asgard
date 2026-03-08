import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { createApp } from './app.js'
import { loadEnv } from './lib/env.js'

const env = loadEnv()

let nodeWs: ReturnType<typeof createNodeWebSocket>

const app = createApp(() => nodeWs)

nodeWs = createNodeWebSocket({ app })

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
