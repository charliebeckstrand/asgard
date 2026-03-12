import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'

import { createDemoApp } from './app.js'
import { environment } from './lib/env.js'

const env = environment()

const app = createDemoApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Demo running on http://localhost:${info.port}`)
	},
)

setupLifecycle({ server, name: 'Demo' })
