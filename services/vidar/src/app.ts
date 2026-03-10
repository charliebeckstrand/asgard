import { createApp } from 'grid'

import { analyze } from './routes/analyze.js'
import { bans } from './routes/bans.js'
import { checkIp } from './routes/check-ip.js'
import { events } from './routes/events.js'
import { health } from './routes/health.js'
import { rules } from './routes/rules.js'
import { threats } from './routes/threats.js'

export function createVidarApp() {
	const { app, setup } = createApp({
		basePath: '/vidar',
		title: 'Vidar',
		description:
			'Security monitoring microservice for threat detection, IP ban enforcement, and optional AI-powered analysis',
	})

	// --- Routes ---

	app.route('/vidar', health)
	app.route('/vidar', events)
	app.route('/vidar', checkIp)
	app.route('/vidar', bans)
	app.route('/vidar', threats)
	app.route('/vidar', rules)
	app.route('/vidar', analyze)

	// --- Finalize ---

	setup()

	return app
}
