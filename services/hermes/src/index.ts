import { serve } from '@hono/node-server'
import { setupLifecycle } from 'norns'

import { createHermesApp } from './app.js'
import { environment } from './lib/env.js'

const env = environment()
const app = createHermesApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Hermes RPC gateway running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/rpc/docs`)
	},
)

setupLifecycle({ server, name: 'Hermes', port: env.PORT })
