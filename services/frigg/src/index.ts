import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadEnv } from './lib/env.js'
import { loadEnvironments } from './lib/environments.js'

const env = loadEnv()

// Pre-load environments at startup to fail fast if the file is missing
const environments = loadEnvironments()
const serviceCount = Object.keys(environments).length

const app = createApp()

serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Frigg config oracle running on http://localhost:${info.port}`)
		console.log(`  ${serviceCount} services loaded from ${env.NODE_ENV} environment`)
		console.log(`  API docs available at http://localhost:${info.port}/services/docs`)
	},
)
