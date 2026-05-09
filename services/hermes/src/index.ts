export type { HermesApp } from './app.js'

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'
import { createHermesApp } from './app.js'
import { closePool, migrate } from './lib/db.js'
import { environment } from './lib/env.js'

const env = environment()

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
await migrate(migrationsDir)

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
