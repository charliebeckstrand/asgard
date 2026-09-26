import { createApp } from 'grid'
import { clientIp } from 'grid/middleware'
import { csrf } from 'hono/csrf'
import { createVidar } from 'vidar/client'

import { environment } from './lib/env.js'
import { logger } from './lib/log.js'
import { session } from './middleware/session.js'
import { authRoutes } from './routes/auth.js'
import { health } from './routes/health.js'
import { mfaRoutes } from './routes/mfa.js'
import { passkeysRoutes } from './routes/passkeys.js'
import { usersRoutes } from './routes/users.js'

export function createBifrostApp() {
	const env = environment()

	const app = createApp({
		basePath: '/api',
		title: 'Bifrost',
		description: '',
		port: env.PORT,
		cors: { origin: env.CORS_ORIGIN, credentials: true },
		logger: logger(),
	})

	app.use('*', clientIp({ header: env.CLIENT_IP_HEADER, proxySecret: env.PROXY_SECRET }))
	app.use('*', session())
	app.use('*', csrf({ origin: env.CORS_ORIGIN }))

	// Also covers `/auth/login` itself, so passkey sign-ins and second steps share the
	// password budget.
	app.use(
		'/auth/login/*',
		createVidar({ rate: 2, burst: 5, route: '/auth/login', service: 'bifrost' }),
	)
	app.use(
		'/auth/register',
		createVidar({ rate: 2, burst: 5, route: '/auth/register', service: 'bifrost' }),
	)

	return app
		.route('/auth', authRoutes)
		.route('/auth/passkeys', passkeysRoutes)
		.route('/auth/mfa', mfaRoutes)
		.route('/api', health)
		.route('/api/users', usersRoutes)
}

export type BifrostApp = ReturnType<typeof createBifrostApp>
