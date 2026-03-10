import { createApp } from 'grid'

import { environment } from './lib/env.js'
import { broadcastMessage } from './routes/broadcast.js'
import { channels } from './routes/channels.js'
import { health } from './routes/health.js'
import { sendMessage } from './routes/send.js'

export function createHermesApp() {
	const env = environment()

	const { app, setup } = createApp({
		basePath: '/messages',
		title: 'Hermes',
		description: '',
		cors: { origin: env.CORS_ORIGIN, credentials: true },
	})

	// --- Routes ---

	app.route('/messages', health)
	app.route('/messages', sendMessage)
	app.route('/messages', broadcastMessage)
	app.route('/messages', channels)

	// --- Finalize ---

	setup()

	return app
}
