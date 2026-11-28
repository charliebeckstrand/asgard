import { createApp } from 'grid'
import { except } from 'hono/combine'

import { logger } from './lib/log.js'
import { apiKeyAuth } from './middleware/api-key.js'
import { bans } from './routes/bans.js'
import { checkIp } from './routes/check-ip.js'
import { events } from './routes/events.js'
import { health } from './routes/health.js'
import { threats } from './routes/threats.js'

const BASE_PATH = '/vidar'
const HEALTH_PATH = `${BASE_PATH}/health`

export function createVidarApp() {
	const app = createApp({
		basePath: BASE_PATH,
		title: 'Vidar',
		description: 'Security events, threat rules and IP bans',
		logger: logger(),
	})

	app.use(`${BASE_PATH}/*`, except(HEALTH_PATH, apiKeyAuth()))

	return app
		.route(BASE_PATH, health)
		.route(BASE_PATH, events)
		.route(BASE_PATH, checkIp)
		.route(BASE_PATH, bans)
		.route(BASE_PATH, threats)
}

export type VidarApp = ReturnType<typeof createVidarApp>
