import { createApp } from 'grid'

import { environment } from './lib/env.js'
import { chatRoutes } from './routes/chat.js'
import { health } from './routes/health.js'

export function createHermesApp() {
	const env = environment()

	const app = createApp({
		basePath: '/hermes',
		title: 'Hermes',
		description: 'Chat and conversation service',
		port: env.PORT,
		cors: { origin: env.CORS_ORIGIN },
	})

	app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'JWT',
	})

	return app.route('/hermes', health).route('/hermes/chat', chatRoutes)
}

export type HermesApp = ReturnType<typeof createHermesApp>
