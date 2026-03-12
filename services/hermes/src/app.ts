import { createApp } from 'grid'

import { environment } from './lib/env.js'
import { timing } from './middleware/timing.js'
import { health } from './routes/health.js'
import { publish } from './routes/publish.js'
import { subscribe } from './routes/subscribe.js'
import { topics } from './routes/topics.js'

export function createHermesApp() {
	const env = environment()

	const { app, setup } = createApp({
		basePath: '/msg',
		title: 'Hermes',
		description: 'Real-time messaging service with pub/sub and SSE streaming',
		port: env.PORT,
		cors: { origin: env.CORS_ORIGIN, credentials: true },
	})

	app.use('/msg/*', timing())

	const routes = app
		.route('/msg', health)
		.route('/msg', publish)
		.route('/msg', subscribe)
		.route('/msg', topics)

	setup()

	return routes
}

export type HermesApp = ReturnType<typeof createHermesApp>
