// TODO: Add huginn service to .do/app.yaml and secrets to .github/workflows/deploy.yml when ready to deploy

import { serve } from '@hono/node-server'
import { setupLifecycle } from 'norns'
import { createHuginnApp } from './app.js'
import { closePool } from './lib/db.js'
import { loadEnv } from './lib/env.js'

const env = loadEnv()
const app = createHuginnApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Huginn running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/events/docs`)
		console.log(`OpenAPI spec at http://localhost:${info.port}/events/openapi.json`)
	},
)

setupLifecycle({ server, name: 'Huginn', port: env.PORT, onShutdown: closePool })
