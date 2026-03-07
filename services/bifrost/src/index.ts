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
		console.log(`Bifrost gateway running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/docs`)
		console.log(`OpenAPI spec at http://localhost:${info.port}/openapi.json`)
	},
)
