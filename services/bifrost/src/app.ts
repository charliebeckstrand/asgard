import { createApp } from 'grid'
import { rateLimit, reportEvent, vidarBanCheck } from 'heimdall'

import { environment } from './lib/env.js'
import { session } from './middleware/session.js'
import { authRoutes } from './routes/auth.js'
import { health } from './routes/health.js'

export function createBifrostApp() {
	const env = environment()

	const { app, setup } = createApp({
		basePath: '/api',
		title: 'Bifrost',
		description: '',
		cors: { origin: env.CORS_ORIGIN, credentials: true },
	})

	app.use('*', session())

	// --- Vidar ban check + rate limiting on auth routes ---

	app.use('/auth/*', vidarBanCheck())

	app.use(
		'/auth/*',
		rateLimit({
			rate: 2,
			burst: 5,
			onLimit: (ip) => reportEvent('rate_limited', ip, { route: '/auth' }),
		}),
	)

	// --- Routes ---

	app.route('/auth', authRoutes)
	app.route('/api', health)

	// --- Finalize ---

	setup()

	return app
}
