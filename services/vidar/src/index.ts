export type { VidarApp } from './app.js'

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'
import { createVidarApp } from './app.js'
import { cleanExpiredBans } from './handlers/bans.js'
import { closePool, migrate } from './lib/db.js'
import { environment } from './lib/env.js'

const env = environment()

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
await migrate(migrationsDir)

const app = createVidarApp()

const CLEANUP_INTERVAL_MS = 3_600_000 // 1 hour

const cleanupTimer = setInterval(() => {
	cleanExpiredBans().catch((err) => {
		console.error('[vidar] Failed to clean expired bans:', err)
	})
}, CLEANUP_INTERVAL_MS)

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Vidar running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/vidar/docs`)
	},
)

setupLifecycle({
	server,
	name: 'Vidar',
	onShutdown: async () => {
		clearInterval(cleanupTimer)

		await closePool()
	},
})
