import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'
import { configure as configureVidar, reportEvent } from 'vidar/client'
import { createBifrostApp } from './app.js'
import { configure } from './auth/index.js'
import { closePool, migrate } from './lib/db.js'
import { environment } from './lib/env.js'
import { logger } from './lib/log.js'
import { createUserRepository } from './lib/user-repository.js'

const env = environment()
const log = logger()

await migrate(import.meta.url)

configureVidar({
	vidarUrl: env.VIDAR_URL,
	vidarApiKey: env.VIDAR_API_KEY,
})

configure({
	userRepository: createUserRepository(),
	keys: { current: env.SECRET_KEY, previous: env.PREVIOUS_SECRET_KEY },
	onSecurityEvent: (event) => reportEvent(event.type, event.ip, event.details ?? {}, 'heimdall'),
})

const app = createBifrostApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		log.info({ port: info.port, docs: '/api/docs' }, 'bifrost listening')
	},
)

setupLifecycle({ server, name: 'Bifrost', onShutdown: closePool })
