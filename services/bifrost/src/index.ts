import { serve } from '@hono/node-server'
import { configure } from 'heimdall'
import { setupLifecycle } from 'norns'
import { createBifrostApp } from './app.js'
import { closePool, getPool } from './lib/db.js'
import { loadEnv } from './lib/env.js'

const env = loadEnv()

configure({
	getPool,
	secretKey: env.SECRET_KEY,
	vidarUrl: env.VIDAR_URL,
	vidarApiKey: env.VIDAR_API_KEY,
	apiKey: env.HEIMDALL_API_KEY,
	accessTokenExpireMinutes: env.ACCESS_TOKEN_EXPIRE_MINUTES,
	refreshTokenExpireDays: env.REFRESH_TOKEN_EXPIRE_DAYS,
})

const app = createBifrostApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Bifrost running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/api/docs`)
	},
)

setupLifecycle({ server, name: 'Bifrost', port: env.PORT, onShutdown: closePool })
