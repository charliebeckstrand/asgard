import { serve } from '@hono/node-server'
import { configure } from 'heimdall'
import { setupLifecycle } from 'norns'

import { createBifrostApp } from './app.js'
import { closePool } from './lib/db.js'
import { environment } from './lib/env.js'
import { createUserRepository } from './lib/user-repository.js'
import { configureHermes, reportEvent } from './middleware/hermes.js'

const env = environment()

configureHermes(env.HERMES_URL)

configure({
	userRepository: createUserRepository(),
	secretKey: env.SECRET_KEY,
	apiKey: env.HEIMDALL_API_KEY,
	onSecurityEvent: (event) => reportEvent(event.type, event.ip, event.details ?? {}, 'heimdall'),
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

setupLifecycle({ server, name: 'Bifrost', onShutdown: closePool })
