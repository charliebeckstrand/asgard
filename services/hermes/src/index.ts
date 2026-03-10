import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { setupLifecycle } from 'norns'
import { createHermesApp } from './app.js'
import { loadEnv } from './lib/env.js'
import { createWsHandler } from './ws/handler.js'

const env = loadEnv()

const app = createHermesApp()
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

setupLifecycle({ server, name: 'Hermes', port: env.PORT })
