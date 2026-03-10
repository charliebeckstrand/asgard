import { serve } from '@hono/node-server'
import { configure } from 'heimdall'
import { setupLifecycle } from 'norns'
import { configure as configureVidar, reportEvent } from 'vidar/client'
import { createBifrostApp } from './app.js'
import { closePool } from './lib/db.js'
import { environment } from './lib/env.js'
import { createUserRepository } from './lib/user-repository.js'

const env = environment()

configureVidar({
	vidarUrl: env.VIDAR_URL,
	vidarApiKey: env.VIDAR_API_KEY,
})

configure({
	userRepository: createUserRepository(),
	secretKey: env.SECRET_KEY,
	apiKey: env.HEIMDALL_API_KEY,
	onSecurityEvent: (eventType, ip, details) =>
		reportEvent(eventType, ip, details ?? {}, 'heimdall'),
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
