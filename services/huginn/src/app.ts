import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { errorHandler, notFoundHandler, requestLogger, securityHeaders } from 'grid'
import { cors } from 'hono/cors'

import { openApiConfig } from './lib/openapi.js'
import { health } from './routes/health.js'
import { publish } from './routes/publish.js'
import { subscriptions } from './routes/subscriptions.js'

export function createApp() {
	const app = new OpenAPIHono()

	// --- Global middleware ---

	app.use('*', cors())
	app.use('*', securityHeaders())
	app.use('*', requestLogger())

	// --- Routes ---

	app.route('/events', health)
	app.route('/events', publish)
	app.route('/events', subscriptions)

	// --- OpenAPI ---

	app.doc('/events/openapi.json', openApiConfig)

	app.get('/events/docs', swaggerUI({ url: '/events/openapi.json' }))

	// --- Error handling ---

	app.onError(errorHandler)
	app.notFound(notFoundHandler)

	return app
}
