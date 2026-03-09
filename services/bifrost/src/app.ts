import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { errorHandler, notFoundHandler, requestLogger } from 'grid'
import { vidarBanCheck } from 'heimdall'
import { cors } from 'hono/cors'

import { openApiConfig } from './lib/openapi.js'
import { session } from './middleware/session.js'
import { authRoutes } from './routes/auth.js'
import { health } from './routes/health.js'

export function createApp() {
	const app = new OpenAPIHono()

	// --- Global middleware ---

	app.use('*', cors())
	app.use('*', requestLogger())
	app.use('*', session())

	// --- Vidar ban check on auth routes ---

	app.use('/auth/*', vidarBanCheck())

	// --- Routes ---

	app.route('/auth', authRoutes)
	app.route('/api', health)

	// --- OpenAPI ---

	app.doc('/api/openapi.json', openApiConfig)

	app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }))

	// --- Error handling ---

	app.onError(errorHandler)
	app.notFound(notFoundHandler)

	return app
}
