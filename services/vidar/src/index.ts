export type { VidarApp } from './app.js'

import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'
import { createVidarApp } from './app.js'
import { cleanExpiredBans } from './handlers/bans.js'
import { purgeOldEvents } from './handlers/events.js'
import { db } from './lib/db.js'
import { environment } from './lib/env.js'
import { logger } from './lib/log.js'

const env = environment()
const log = logger()

const app = createVidarApp()

const CLEANUP_INTERVAL_MS = 3_600_000 // 1 hour
const EVENT_RETENTION_DAYS = 30

const cleanupTimer = setInterval(() => {
	cleanExpiredBans().catch((err) => {
		log.error({ err }, 'failed to clean expired bans')
	})

	purgeOldEvents(EVENT_RETENTION_DAYS).catch((err) => {
		log.error({ err }, 'failed to purge old events')
	})
}, CLEANUP_INTERVAL_MS)

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		log.info(
			{ port: info.port, docs: '/vidar/docs' },
			`vidar listening on http://localhost:${info.port}`,
		)
	},
)

setupLifecycle({
	server,
	name: 'Vidar',
	onShutdown: async () => {
		clearInterval(cleanupTimer)

		await db.close()
	},
})
