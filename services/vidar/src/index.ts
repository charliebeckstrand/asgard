import { serve } from '@hono/node-server'
import { setupLifecycle } from 'norns'
import { createVidarApp } from './app.js'
import { cleanExpiredBans } from './handlers/bans.js'
import { closePool } from './lib/db.js'
import { environment } from './lib/env.js'

const env = environment()
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
	port: env.PORT,
	onShutdown: async () => {
		clearInterval(cleanupTimer)

		await closePool()
	},
})
