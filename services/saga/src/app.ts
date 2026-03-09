import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { errorHandler, notFoundHandler, requestLogger } from 'grid'
import { cors } from 'hono/cors'

import { openApiConfig } from './lib/openapi.js'
import { health } from './routes/health.js'
import { logs } from './routes/logs.js'

export function createApp() {
	const app = new OpenAPIHono()

	// --- Global middleware ---

	app.use('*', cors())
	app.use('*', requestLogger())

	// --- Routes ---

	app.route('/logs', health)
	app.route('/logs', logs)

	// --- OpenAPI ---

	app.doc('/logs/openapi.json', openApiConfig)

	app.get('/logs/docs', swaggerUI({ url: '/logs/openapi.json' }))

	// --- Error handling ---

	app.onError(errorHandler)
	app.notFound(notFoundHandler)

	return app
}
