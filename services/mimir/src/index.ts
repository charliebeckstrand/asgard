export type { MimirApp } from './app.js'

import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'
import { createMimirApp } from './app.js'
import { db } from './lib/db.js'
import { environment } from './lib/env.js'
import { logger } from './lib/log.js'

const env = environment()
const log = logger()

const app = createMimirApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		log.info(
			{ port: info.port, docs: '/api/docs' },
			`mimir listening on http://localhost:${info.port}`,
		)
	},
)

setupLifecycle({
	server,
	name: 'Mimir',
	onShutdown: () => db.close(),
})
