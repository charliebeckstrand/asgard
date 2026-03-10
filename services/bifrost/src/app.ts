import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { errorHandler, notFoundHandler, requestLogger, securityHeaders } from 'grid'
import { rateLimit, reportEvent, vidarBanCheck } from 'heimdall'
import { cors } from 'hono/cors'

import { loadEnv } from './lib/env.js'
import { openApiConfig } from './lib/openapi.js'
import { session } from './middleware/session.js'
import { authRoutes } from './routes/auth.js'
import { health } from './routes/health.js'

export function createApp() {
	const env = loadEnv()

	const app = new OpenAPIHono()

	// --- Global middleware ---

	app.use('*', cors({ origin: env.CORS_ORIGIN, credentials: true }))
	app.use('*', securityHeaders())
	app.use('*', requestLogger())
	app.use('*', session())

	// --- Vidar ban check + rate limiting on auth routes ---

	app.use('/auth/*', vidarBanCheck())

	app.use(
		'/auth/*',
		rateLimit({
			rate: 2,
			burst: 5,
			onLimit: (ip) => reportEvent('rate_limited', ip, { route: '/auth' }),
		}),
	)

	// --- Routes ---

	app.get('/', (c) => c.json({}))

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
