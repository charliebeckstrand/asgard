import { createApp } from 'grid'

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

	const auth = apiKeyAuth()

	app.use(`${BASE_PATH}/*`, async (c, next) => {
		if (c.req.path === HEALTH_PATH) return next()

		return auth(c, next)
	})

	return app
		.route(BASE_PATH, health)
		.route(BASE_PATH, events)
		.route(BASE_PATH, checkIp)
		.route(BASE_PATH, bans)
		.route(BASE_PATH, threats)
}

export type VidarApp = ReturnType<typeof createVidarApp>
