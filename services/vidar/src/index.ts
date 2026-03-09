import { serve } from '@hono/node-server'
import { setupLifecycle } from 'norns'
import { createApp } from './app.js'
import { closePool } from './lib/db.js'
import { loadEnv } from './lib/env.js'

const env = loadEnv()
const app = createApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Vidar running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/vidar/docs`)
	},
)

setupLifecycle({ server, name: 'Vidar', port: env.PORT, onShutdown: closePool })
