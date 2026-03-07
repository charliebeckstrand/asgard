// TODO: Add ratatoskr service to .do/app.yaml and secrets to .github/workflows/deploy.yml when ready to deploy

import { serve } from "@hono/node-server"
import { createApp } from "./app.js"
import { loadEnv } from "./lib/env.js"

const env = loadEnv()
const app = createApp()

serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Ratatoskr event bus running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/events/docs`)
		console.log(`OpenAPI spec at http://localhost:${info.port}/events/openapi.json`)
	},
)
