import { createApp, createProxy } from 'grid'
import { csrf } from 'hono/csrf'
import { createVidar } from 'vidar/client'

import { environment } from './lib/env.js'
import { session } from './middleware/session.js'
import { authRoutes } from './routes/auth.js'
import { health } from './routes/health.js'
import { usersRoutes } from './routes/users.js'

export function createBifrostApp() {
	const env = environment()

	const { app, setup } = createApp({
		basePath: '/api',
		title: 'Bifrost',
		description: '',
		cors: { origin: env.CORS_ORIGIN, credentials: true },
	})

	app.use('*', session())
	app.use('*', csrf({ origin: env.CORS_ORIGIN }))

	// --- Vidar ban check + rate limiting on auth routes ---

	app.use('/auth/*', createVidar({ rate: 2, burst: 5, route: '/auth' }))

	// --- Routes ---

	const routes = app
		.route('/auth', authRoutes)
		.route('/api', health)
		.route('/api/users', usersRoutes)

	// --- Proxy to downstream services ---

	app.all('/events/*', createProxy(env.HUGINN_URL))

	if (env.VIDAR_URL) {
		app.all('/vidar/*', createProxy(env.VIDAR_URL))
	}

	// --- Finalize ---

	setup()

	return routes
}

export type BifrostApp = ReturnType<typeof createBifrostApp>
