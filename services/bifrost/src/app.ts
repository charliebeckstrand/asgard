import { createApp } from 'grid'
import { csrf } from 'hono/csrf'
import { createVidar } from 'vidar/client'

import { environment } from './lib/env.js'
import { session } from './middleware/session.js'
import { authRoutes } from './routes/auth.js'
import { chatRoutes } from './routes/chat.js'
import { chatAgentRoutes } from './routes/chat-agent.js'
import { health } from './routes/health.js'
import { usersRoutes } from './routes/users.js'

export function createBifrostApp() {
	const env = environment()

	const { app, setup } = createApp({
		basePath: '/api',
		title: 'Bifrost',
		description: '',
		port: env.PORT,
		cors: { origin: env.CORS_ORIGIN, credentials: true },
	})

	app.use('*', session())
	app.use('*', csrf({ origin: env.CORS_ORIGIN }))

	app.use(
		'/auth/login',
		createVidar({ rate: 2, burst: 5, route: '/auth/login', service: 'bifrost' }),
	)
	app.use(
		'/auth/register',
		createVidar({ rate: 2, burst: 5, route: '/auth/register', service: 'bifrost' }),
	)

	const routes = app
		.route('/auth', authRoutes)
		.route('/api', health)
		.route('/api/chat', chatRoutes)
		.route('/api/chat', chatAgentRoutes)
		.route('/api/users', usersRoutes)

	setup()

	return routes
}

export type BifrostApp = ReturnType<typeof createBifrostApp>
