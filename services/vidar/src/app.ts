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

const BASE_PATH = '/vidar'

export function createVidarApp() {
	const env = environment()

	const { app, setup } = createApp({
		basePath: BASE_PATH,
		title: 'Vidar',
		description: '',
		port: env.PORT,
	})

	const routes = app
		.route(BASE_PATH, health)
		.route(BASE_PATH, events)
		.route(BASE_PATH, checkIp)
		.route(BASE_PATH, bans)
		.route(BASE_PATH, threats)
		.route(BASE_PATH, rules)
		.route(BASE_PATH, analyze)
		.route(BASE_PATH, securityStream)

	setup()

	return routes
}

export type VidarApp = ReturnType<typeof createVidarApp>
