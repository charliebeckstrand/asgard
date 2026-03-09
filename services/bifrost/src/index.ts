import { serve } from '@hono/node-server'
import { configure } from 'heimdall'
import { createLazyPool } from 'mimir'
import { setupLifecycle } from 'norns'
import { createApp } from './app.js'
import { loadEnv } from './lib/env.js'

const env = loadEnv()

const { getPool, closePool } = createLazyPool(() => env.DATABASE_URL, { max: 5 })

configure({
	getPool,
	secretKey: env.SECRET_KEY,
	vidarUrl: env.VIDAR_URL,
	vidarApiKey: env.VIDAR_API_KEY,
	apiKey: env.HEIMDALL_API_KEY,
	accessTokenExpireMinutes: env.ACCESS_TOKEN_EXPIRE_MINUTES,
	refreshTokenExpireDays: env.REFRESH_TOKEN_EXPIRE_DAYS,
})

const app = createApp()

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
