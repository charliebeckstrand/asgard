import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'

import { openApiConfig } from './lib/openapi.js'
import { analyze } from './routes/analyze.js'
import { bans } from './routes/bans.js'
import { checkIp } from './routes/check-ip.js'
import { events } from './routes/events.js'
import { health } from './routes/health.js'
import { rules } from './routes/rules.js'
import { threats } from './routes/threats.js'

export function createApp() {
	const app = new OpenAPIHono()

	// --- CORS ---

	app.use('*', cors())

	// --- Routes ---

	app.route('/vidar', health)
	app.route('/vidar', events)
	app.route('/vidar', checkIp)
	app.route('/vidar', bans)
	app.route('/vidar', threats)
	app.route('/vidar', rules)
	app.route('/vidar', analyze)

	// --- OpenAPI ---

	app.doc('/vidar/openapi.json', openApiConfig)
	app.get('/vidar/docs', swaggerUI({ url: '/vidar/openapi.json' }))

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
