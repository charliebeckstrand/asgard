export type { HermesApp } from './app.js'

import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'
import { createHermesApp } from './app.js'
import { closePool, migrate } from './lib/db.js'
import { environment } from './lib/env.js'

const env = environment()

await migrate(import.meta.url)

const app = createHermesApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Hermes running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/hermes/docs`)
	},
)

setupLifecycle({ server, name: 'Hermes', onShutdown: closePool })
