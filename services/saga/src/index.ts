// TODO: Add saga service to .do/app.yaml and secrets to .github/workflows/deploy.yml when ready to deploy

import { serve } from '@hono/node-server'
import { setupLifecycle } from 'norns'
import { createApp } from './app.js'
import { closePool } from './lib/db.js'
import { loadEnv } from './lib/env.js'
import { registerHuginnSubscription } from './services/huginn.js'

const env = loadEnv()
const app = createApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Saga running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/logs/docs`)
		console.log(`OpenAPI spec at http://localhost:${info.port}/logs/openapi.json`)
	},
)

setupLifecycle({ server, name: 'Saga', port: env.PORT, onShutdown: closePool })

registerHuginnSubscription().catch((err) => {
	console.warn('[saga] Huginn subscription registration failed:', err)
})
