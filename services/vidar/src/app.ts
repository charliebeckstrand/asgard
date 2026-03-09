import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { errorHandler, notFoundHandler, securityHeaders } from 'grid'
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

	// --- Global middleware ---

	app.use('*', cors())
	app.use('*', securityHeaders())

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

	app.onError(errorHandler)
	app.notFound(notFoundHandler)

	return app
}
