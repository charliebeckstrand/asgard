import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'

import { openApiConfig } from './lib/openapi.js'
import { config } from './routes/config.js'
import { health } from './routes/health.js'

export function createApp() {
	const app = new OpenAPIHono()

	// --- CORS ---

	app.use('*', cors())

	// --- Routes ---

	app.route('/frigg', health)
	app.route('/frigg', config)

	// --- OpenAPI ---

	app.doc('/frigg/openapi.json', openApiConfig)
	app.get('/frigg/docs', swaggerUI({ url: '/frigg/openapi.json' }))

	// --- Error handling ---

	app.onError((err, c) => {
		if ('status' in err && typeof err.status === 'number') {
			return c.json(
				{ error: err.name, message: err.message, statusCode: err.status },
				err.status as 400,
			)
		}

		console.error(`Unhandled error: ${err.message}`, err.stack)

		return c.json({ error: 'Internal Server Error', message: err.message, statusCode: 500 }, 500)
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
