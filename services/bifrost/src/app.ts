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
		cors: { origin: env.APP_ORIGINS, credentials: true },
		logger: logger(),
	})

	// App Platform overwrites `do-connecting-ip` with the client address on every request.
	app.use('*', clientIp({ header: 'do-connecting-ip', secret: env.CLIENT_IP_SECRET }))
	app.use('*', session())
	app.use('*', csrf({ origin: env.APP_ORIGINS }))

	// Also covers `/auth/login` itself and the second step of a session, so passkey
	// sign-ins and second steps share the password budget.
	// Ten tries, then one every six seconds per address.
	const loginLimit = createVidar({
		rate: 1 / 6,
		burst: 10,
		route: '/auth/login',
		service: 'bifrost',
	})

	app.use('/auth/login/*', loginLimit)
	app.use('/auth/session/verify/*', loginLimit)

	// Each start stores a state row, and each callback calls the provider and can
	// make an account. Ten tries, then one every six seconds per address.
	const oauthLimit = createVidar({
		rate: 1 / 6,
		burst: 10,
		route: '/auth/oauth',
		service: 'bifrost',
	})

	app.use('/auth/oauth/:provider/start', oauthLimit)
	app.use('/auth/oauth/:provider/callback', oauthLimit)

	// Three accounts, then one a minute per address, so no one can fill the database.
	app.use(
		'/auth/register',
		createVidar({ rate: 1 / 60, burst: 3, route: '/auth/register', service: 'bifrost' }),
	)

	// Each request can send an email. Three, then one a minute per address. A
	// user also gets at most one email of each kind a minute.
	const emailLimit = createVidar({
		rate: 1 / 60,
		burst: 3,
		route: '/auth/email',
		service: 'bifrost',
	})

	app.use('/auth/verify-email', emailLimit)
	app.use('/auth/reset-password', emailLimit)

	// Hashes a new password, like a sign-in checks one.
	app.use('/auth/reset-password/confirm', loginLimit)

	return app
		.route('/auth', authRoutes)
		.route('/auth/passkeys', passkeysRoutes)
		.route('/auth/mfa', mfaRoutes)
		.route('/auth/oauth', oauthRoutes)
		.route('/api', health)
		.route('/api/users', usersRoutes)
}
