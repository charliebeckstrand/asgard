import { createApp } from 'grid'
import { rateLimit } from 'grid/middleware'
import type { MiddlewareHandler } from 'hono'
import { except } from 'hono/combine'

import { logger } from './lib/log.js'
import { apiKeyAuth } from './middleware/api-key.js'
import { forwardedUser, type UserEnv, userKey } from './middleware/user.js'
import { accountRoutes } from './routes/account.js'
import { health } from './routes/health.js'
import { numbersRoutes } from './routes/numbers.js'
import { photosRoutes } from './routes/photos.js'
import { placesRoutes } from './routes/places.js'
import { predictionsRoutes } from './routes/predictions.js'
import { tripsRoutes } from './routes/trips.js'
import { visitsRoutes } from './routes/visits.js'

// The same base path as bifrost, which forwards `/api/places`, `/api/visits`,
// `/api/trips`, `/api/photos`, `/api/predictions` and `/api/games` here
// unchanged, so the paths in this spec are the ones apps call.
const BASE_PATH = '/api'
const HEALTH_PATH = `${BASE_PATH}/health`

export function createMimirApp() {
	const app = createApp<UserEnv>({
		basePath: BASE_PATH,
		title: 'Mimir',
		description: 'App data, reached through bifrost',
		logger: logger(),
	})

	// Per user, not per address: Midgard's server reads for its pages, so many
	// users share its address. A page load reads a few lists, and each change is
	// one request. Sixty, then two a second. A read of a public board can come with
	// no user, and has none to count by, so it isn't limited here.
	const limit = rateLimit({ rate: 2, burst: 60, key: userKey })

	const limitUser: MiddlewareHandler<UserEnv> = (c, next) =>
		c.get('user') ? limit(c, next) : next()

	app.use(`${BASE_PATH}/*`, except(HEALTH_PATH, apiKeyAuth(), forwardedUser(), limitUser))

	return app
		.route(BASE_PATH, health)
		.route(BASE_PATH, accountRoutes)
		.route(BASE_PATH, placesRoutes)
		.route(BASE_PATH, visitsRoutes)
		.route(BASE_PATH, tripsRoutes)
		.route(BASE_PATH, photosRoutes)
		.route(BASE_PATH, predictionsRoutes)
		.route(BASE_PATH, numbersRoutes)
}
