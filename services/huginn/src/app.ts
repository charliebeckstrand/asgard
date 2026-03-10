import { createApp } from 'grid'

import { environment } from './lib/env.js'
import { health } from './routes/health.js'
import { publish } from './routes/publish.js'
import { eventStream } from './routes/stream.js'
import { subscriptions } from './routes/subscriptions.js'

export function createHuginnApp() {
	const env = environment()

	const { app, setup } = createApp({
		basePath: '/events',
		title: 'Huginn',
		description: '',
		cors: { origin: env.CORS_ORIGIN, credentials: true },
	})

	// --- Routes ---

	const routes = app
		.route('/events', health)
		.route('/events', publish)
		.route('/events', subscriptions)
		.route('/events', eventStream)

	// --- Finalize ---

	setup()

	return routes
}

export type HuginnApp = ReturnType<typeof createHuginnApp>
