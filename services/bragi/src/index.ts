export type { BragiApp } from './app.js'

import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'
import { createBragiApp } from './app.js'
import { closePool, migrate } from './lib/db.js'
import { environment } from './lib/env.js'
import { logger } from './lib/log.js'

const env = environment()
const log = logger()

await migrate(import.meta.url)

const app = createBragiApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		log.info({ port: info.port, docs: '/bragi/docs' }, 'bragi listening')
	},
)

setupLifecycle({ server, name: 'Bragi', onShutdown: closePool })
