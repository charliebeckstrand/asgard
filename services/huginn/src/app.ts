import { createApp } from 'grid'

import { environment } from './lib/env.js'
import { health } from './routes/health.js'
import { publish } from './routes/publish.js'
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

	app.route('/events', health)
	app.route('/events', publish)
	app.route('/events', subscriptions)

	// --- Finalize ---

	setup()

	return app
}
