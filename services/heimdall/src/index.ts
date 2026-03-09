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
		console.log(`Heimdall running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/auth/docs`)
	},
)

setupLifecycle({ server, name: 'Heimdall', port: env.PORT, onShutdown: closePool })
