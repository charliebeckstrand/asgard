import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { errorHandler, notFoundHandler, requestLogger } from 'grid'
import { cors } from 'hono/cors'

import { openApiConfig } from './lib/openapi.js'
import { session } from './middleware/session.js'
import { authRoutes } from './routes/auth.js'
import { health } from './routes/health.js'
import { users } from './routes/users.js'

export function createApp() {
	const app = new OpenAPIHono()

	// --- Global middleware ---

	app.use('*', cors())
	app.use('*', requestLogger())
	app.use('*', session())

	// --- Routes ---

	app.route('/auth', authRoutes)
	app.route('/api', health)
	app.route('/api', users)

	// --- OpenAPI ---

	app.doc('/api/openapi.json', openApiConfig)

	app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }))

	// --- Error handling ---

	app.onError(errorHandler)
	app.notFound(notFoundHandler)

	return app
}
