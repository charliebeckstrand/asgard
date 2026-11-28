import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'
import { createVidarApp } from './app.js'
import { cleanExpiredBans } from './handlers/bans.js'
import { purgeOldEvents } from './handlers/events.js'
import { purgeOldThreats } from './handlers/threats.js'
import { db } from './lib/db.js'
import { environment } from './lib/env.js'
import { logger } from './lib/log.js'

const env = environment()
const log = logger()

const app = createVidarApp()

const CLEANUP_INTERVAL_MS = 3_600_000 // 1 hour

// Rules look back 30 minutes at most, and the logs keep the rest, so a day of
// events is plenty. Threats are what an admin reviews, so they stay a month.
const EVENT_RETENTION_DAYS = 1
const THREAT_RETENTION_DAYS = 30

const cleanupTasks: [string, () => Promise<number>][] = [
	['clean expired bans', cleanExpiredBans],
	['purge old events', () => purgeOldEvents(EVENT_RETENTION_DAYS)],
	['purge old threats', () => purgeOldThreats(THREAT_RETENTION_DAYS)],
]

function cleanUp() {
	for (const [name, task] of cleanupTasks) {
		task().catch((err) => {
			log.error({ err }, `failed to ${name}`)
		})
	}
}

// Also on start, so deploys more often than hourly don't skip it.
cleanUp()

const cleanupTimer = setInterval(cleanUp, CLEANUP_INTERVAL_MS)

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
	logger: log,
	onShutdown: async () => {
		clearInterval(cleanupTimer)

		await db.close()
	},
})
