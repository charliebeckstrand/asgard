import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadEnv } from './lib/env.js'

const env = loadEnv()
const app = createApp()

serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Frigg secrets management service running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/frigg/docs`)
	},
)
