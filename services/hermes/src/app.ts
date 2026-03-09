import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { errorHandler, notFoundHandler, requestLogger, securityHeaders } from 'grid'
import { cors } from 'hono/cors'

import { loadEnv } from './lib/env.js'
import { openApiConfig } from './lib/openapi.js'
import { broadcastMessage } from './routes/broadcast.js'
import { channels } from './routes/channels.js'
import { health } from './routes/health.js'
import { sendMessage } from './routes/send.js'

export function createApp() {
	const env = loadEnv()

	const app = new OpenAPIHono()

	// --- Global middleware ---

	app.use('*', cors({ origin: env.CORS_ORIGIN, credentials: true }))
	app.use('*', securityHeaders())
	app.use('*', requestLogger())

	// --- Routes ---

	app.route('/messages', health)
	app.route('/messages', sendMessage)
	app.route('/messages', broadcastMessage)
	app.route('/messages', channels)

	// --- OpenAPI ---

	app.doc('/messages/openapi.json', openApiConfig)

	app.get('/messages/docs', swaggerUI({ url: '/messages/openapi.json' }))

	// --- Error handling ---

	app.onError(errorHandler)
	app.notFound(notFoundHandler)

	return app
}
