import { serve } from '@hono/node-server'
import { setupLifecycle } from 'norns'
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

setupLifecycle({ server, name: 'Bifrost', port: env.PORT })
