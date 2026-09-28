import { createApp } from 'grid'
import { rateLimit } from 'grid/middleware'

import { logger } from './lib/log.js'
import { apiKeyAuth } from './middleware/api-key.js'
import { forwardedUser, type UserEnv, userKey } from './middleware/user.js'
import { accountRoutes } from './routes/account.js'
import { health } from './routes/health.js'
import { placesRoutes } from './routes/places.js'
import { visitsRoutes } from './routes/visits.js'

// The same base path as bifrost, which forwards `/api/places` and `/api/visits`
// here unchanged, so the paths in this spec are the ones apps call.
const BASE_PATH = '/api'
const HEALTH_PATH = `${BASE_PATH}/health`

export function createMimirApp() {
	const app = createApp<UserEnv>({
		basePath: BASE_PATH,
		title: 'Mimir',
		description: 'App data, reached through bifrost',
		logger: logger(),
	})

	const auth = apiKeyAuth()

	app.use(`${BASE_PATH}/*`, async (c, next) => {
		if (c.req.path === HEALTH_PATH) return next()

		return auth(c, next)
	})

	// Per user, not per address: Midgard's server reads for its pages, so many
	// users share its address. A page load reads a few lists, and each change is
	// one request. Sixty, then two a second.
	const limit = rateLimit({ rate: 2, burst: 60, key: userKey })

	for (const path of [`${BASE_PATH}/account`, `${BASE_PATH}/places/*`, `${BASE_PATH}/visits/*`]) {
		app.use(path, forwardedUser(), limit)
	}

	return app
		.route(BASE_PATH, health)
		.route(BASE_PATH, accountRoutes)
		.route(BASE_PATH, placesRoutes)
		.route(BASE_PATH, visitsRoutes)
}

export type MimirApp = ReturnType<typeof createMimirApp>
