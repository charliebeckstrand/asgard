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
import { oauthRoutes } from './routes/oauth.js'
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

	// App Platform overwrites `do-connecting-ip` with the client address on every request.
	app.use('*', clientIp({ header: 'do-connecting-ip', secret: env.CLIENT_IP_SECRET }))
	app.use('*', session())
	app.use('*', csrf({ origin: env.CORS_ORIGIN }))

	// Also covers `/auth/login` itself, so passkey sign-ins and second steps share the
	// password budget. Only a POST tries a credential. The GET and the DELETE of a
	// pending sign-in check a 256-bit ticket, and a page guard calls the GET from
	// the server of the app, so they stay out of the budget.
	const loginLimit = createVidar({ rate: 2, burst: 5, route: '/auth/login', service: 'bifrost' })

	app.use('/auth/login/*', (c, next) => (c.req.method === 'POST' ? loginLimit(c, next) : next()))
	// Each start stores a state row and each callback calls the provider.
	const oauthLimit = createVidar({ rate: 2, burst: 5, route: '/auth/oauth', service: 'bifrost' })

	app.use('/auth/oauth/:provider/start', oauthLimit)
	app.use('/auth/oauth/:provider/callback', oauthLimit)
	app.use(
		'/auth/register',
		createVidar({ rate: 2, burst: 5, route: '/auth/register', service: 'bifrost' }),
	)

	return app
		.route('/auth', authRoutes)
		.route('/auth/passkeys', passkeysRoutes)
		.route('/auth/mfa', mfaRoutes)
		.route('/auth/oauth', oauthRoutes)
		.route('/api', health)
		.route('/api/users', usersRoutes)
}

export type BifrostApp = ReturnType<typeof createBifrostApp>
