import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'

import { loadEnv } from './lib/env.js'
import { openApiConfig } from './lib/openapi.js'
import { vidarBanCheck } from './middleware/vidar.js'
import { health } from './routes/health.js'
import { login } from './routes/login.js'
import { me } from './routes/me.js'
import { refresh } from './routes/refresh.js'
import { register } from './routes/register.js'
import { verify } from './routes/verify.js'

export function createApp() {
	const app = new OpenAPIHono()
	const env = loadEnv()

	// --- CORS ---

	const origins = env.CORS_ORIGINS?.split(',')
		.map((s) => s.trim())
		.filter(Boolean)

	if (origins && origins.length > 0) {
		app.use(
			'*',
			cors({
				origin: origins,
				allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
				allowHeaders: ['Authorization', 'Accept', 'Content-Type'],
				credentials: true,
			}),
		)
	} else {
		app.use('*', cors())
	}

	// --- Vidar ban check ---

	app.use('/auth/*', vidarBanCheck())

	// --- Routes ---

	app.route('/auth', health)
	app.route('/auth', register)
	app.route('/auth', login)
	app.route('/auth', refresh)
	app.route('/auth', verify)
	app.route('/auth', me)

	// --- OpenAPI ---

	app.doc('/auth/openapi.json', openApiConfig)
	app.get('/auth/docs', swaggerUI({ url: '/auth/openapi.json' }))

	// --- Error handling ---

	app.onError((err, c) => {
		if ('status' in err && typeof err.status === 'number') {
			return c.json({ detail: err.message }, err.status as 400)
		}

		console.error(`Unhandled error: ${err.message}`, err.stack)

		return c.json({ detail: 'Internal server error' }, 500)
	})

	app.notFound((c) => {
		return c.json({ detail: `Route ${c.req.method} ${c.req.path} not found` }, 404)
	})

	return app
}
