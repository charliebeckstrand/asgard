import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'

import { openApiConfig } from './lib/openapi.js'
import { health } from './routes/health.js'
import { secrets } from './routes/secrets.js'
import { validate } from './routes/validate.js'

export function createApp() {
	const app = new OpenAPIHono()

	// --- CORS ---

	app.use('*', cors())

	// --- Routes ---

	app.route('/services', health)
	app.route('/services', validate)
	app.route('/services', secrets)

	// --- OpenAPI ---

	app.doc('/services/openapi.json', openApiConfig)
	app.get('/services/docs', swaggerUI({ url: '/services/openapi.json' }))

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
