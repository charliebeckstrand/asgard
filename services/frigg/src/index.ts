import { serve } from '@hono/node-server'
import { setupLifecycle } from 'norns'
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

setupLifecycle({ server, name: 'Frigg', port: env.PORT })
