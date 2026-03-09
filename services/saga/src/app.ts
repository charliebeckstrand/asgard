import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'

import { openApiConfig } from './lib/openapi.js'
import { requestLogger } from './middleware/logger.js'
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
