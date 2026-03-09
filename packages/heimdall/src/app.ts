import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { createOpenApiConfig } from 'grid'

import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { HeimdallConfig } from './config.js'
import { configure } from './config.js'
import { vidarBanCheck } from './middleware/vidar.js'
import { health } from './routes/health.js'
import { login } from './routes/login.js'
import { me } from './routes/me.js'
import { refresh } from './routes/refresh.js'
import { register } from './routes/register.js'
import { verify } from './routes/verify.js'

const openApiConfig = createOpenApiConfig({
	title: 'Heimdall',
	description: 'JWT authentication',
})

/**
 * Creates a standalone Heimdall auth app.
 *
 * Calls `configure()` with the provided config, then mounts all auth routes
 * under the root. Intended to be mounted at `/auth` by the consuming service.
 */
export function createAuthApp(
	config: Partial<HeimdallConfig> & Pick<HeimdallConfig, 'getPool' | 'secretKey'>,
) {
	configure(config)

	const app = new OpenAPIHono()

	// --- Vidar ban check ---

	app.use('/*', vidarBanCheck())

	// --- Routes ---

	app.route('/', health)
	app.route('/', register)
	app.route('/', login)
	app.route('/', refresh)
	app.route('/', verify)
	app.route('/', me)

	// --- OpenAPI ---

	app.doc('/openapi.json', openApiConfig)
	app.get('/docs', swaggerUI({ url: '/auth/openapi.json' }))

	// --- Error handling ---

	app.onError((err, c) => {
		if ('status' in err && typeof err.status === 'number') {
			return c.json({ detail: err.message }, err.status as ContentfulStatusCode)
		}

		console.error(`Unhandled error: ${err.message}`, err.stack)

		return c.json({ detail: 'Internal server error' }, 500)
	})

	app.notFound((c) => {
		return c.json({ detail: `Route ${c.req.method} ${c.req.path} not found` }, 404)
	})

	return app
}
