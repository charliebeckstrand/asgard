import { serve } from '@hono/node-server'
import { configure } from 'heimdall'
import { setupLifecycle } from 'norns'
import { createBifrostApp } from './app.js'
import { closePool } from './lib/db.js'
import { environment } from './lib/env.js'
import { createUserRepository } from './lib/user-repository.js'

const env = environment()

configure({
	userRepository: createUserRepository(),
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
