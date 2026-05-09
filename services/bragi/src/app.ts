import { createApp } from 'grid'

import { environment } from './lib/env.js'
import { chatRoutes } from './routes/chat.js'
import { health } from './routes/health.js'

export function createBragiApp() {
	const env = environment()

	const app = createApp({
		basePath: '/bragi',
		title: 'Bragi',
		description: 'Chat and conversation service',
		port: env.PORT,
		cors: { origin: env.CORS_ORIGIN },
	})

	app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'JWT',
	})

	return app.route('/bragi', health).route('/bragi/chat', chatRoutes)
}

export type BragiApp = ReturnType<typeof createBragiApp>
