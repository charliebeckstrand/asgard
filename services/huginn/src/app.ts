import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'

import { openApiConfig } from './lib/openapi.js'
import { requestLogger } from './middleware/logger.js'
import { health } from './routes/health.js'
import { publish } from './routes/publish.js'
import { subscriptions } from './routes/subscriptions.js'

export function createApp() {
	const app = new OpenAPIHono()

	// --- Global middleware ---

	app.use('*', cors())
	app.use('*', requestLogger())

	// --- Routes ---

	app.route('/events', health)
	app.route('/events', publish)
	app.route('/events', subscriptions)

	// --- OpenAPI ---

	app.doc('/events/openapi.json', openApiConfig)

	app.get('/events/docs', swaggerUI({ url: '/events/openapi.json' }))

	// --- Error handling ---

	app.onError((err, c) => {
		if (err instanceof HTTPException) {
			return c.json(
				{
					error: err.name,
					message: err.message,
					statusCode: err.status,
				},
				err.status,
			)
		}

		console.error(`Unhandled error: ${err.message}`, err.stack)

		return c.json(
			{
				error: 'Internal Server Error',
				message: err.message,
				statusCode: 500,
			},
			500,
		)
	})

	app.notFound((c) => {
		return c.json(
			{
				error: 'Not Found',
				message: `Route ${c.req.method} ${c.req.path} not found`,
				statusCode: 404,
			},
			404,
		)
	})

	return app
}
