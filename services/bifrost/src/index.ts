import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'
import { configure as configureVidar, reportEvent } from 'vidar/client'
import { createBifrostApp } from './app.js'
import { configure, deleteExpiredSessions } from './auth/index.js'
import { db } from './lib/db.js'
import { environment } from './lib/env.js'
import { logger } from './lib/log.js'
import { createSessionRepository } from './lib/session-repository.js'
import { createUserRepository } from './lib/user-repository.js'

const env = environment()
const log = logger()

configureVidar({
	vidarUrl: env.VIDAR_URL,
	vidarApiKey: env.VIDAR_API_KEY,
	logger: log,
})

configure({
	userRepository: createUserRepository(),
	sessionRepository: createSessionRepository(),
	onSecurityEvent: (event) => reportEvent(event.type, event.ip, event.details ?? {}, 'bifrost'),
})

const app = createBifrostApp()

const SWEEP_INTERVAL_MS = 3_600_000 // 1 hour

const sweepTimer = setInterval(() => {
	deleteExpiredSessions().catch((err) => {
		log.error({ err }, 'failed to delete expired sessions')
	})
}, SWEEP_INTERVAL_MS)

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		log.info(
			{ port: info.port, docs: '/api/docs' },
			`bifrost listening on http://localhost:${info.port}`,
		)
	},
)

setupLifecycle({
	server,
	name: 'Bifrost',
	onShutdown: async () => {
		clearInterval(sweepTimer)

		await db.close()
	},
})
