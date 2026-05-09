import { createApp } from 'grid'

import { environment } from './lib/env.js'
import { chatRoutes } from './routes/chat.js'
import { health } from './routes/health.js'

export function createHermesApp() {
	const env = environment()

	const { app, setup } = createApp({
		basePath: '/hermes',
		title: 'Hermes',
		description: '',
		port: env.PORT,
	})

	const routes = app.route('/hermes', health).route('/hermes/chat', chatRoutes)

	setup()

	return routes
}

export type HermesApp = ReturnType<typeof createHermesApp>
