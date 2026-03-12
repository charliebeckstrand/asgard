import { createApp } from 'grid'

import { environment } from './lib/env.js'
import { analyze } from './routes/analyze.js'
import { bans } from './routes/bans.js'
import { checkIp } from './routes/check-ip.js'
import { events } from './routes/events.js'
import { health } from './routes/health.js'
import { rules } from './routes/rules.js'
import { securityStream } from './routes/stream.js'
import { threats } from './routes/threats.js'

export function createVidarApp() {
	const env = environment()

	const { app, setup } = createApp({
		basePath: '/vidar',
		title: 'Vidar',
		description: '',
		port: env.PORT,
	})

	const routes = app
		.route('/vidar', health)
		.route('/vidar', events)
		.route('/vidar', checkIp)
		.route('/vidar', bans)
		.route('/vidar', threats)
		.route('/vidar', rules)
		.route('/vidar', analyze)
		.route('/vidar', securityStream)

	setup()

	return routes
}

export type VidarApp = ReturnType<typeof createVidarApp>
