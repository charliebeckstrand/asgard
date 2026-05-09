import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import type { Env } from 'hono'
import { compress } from 'hono/compress'
import { cors } from 'hono/cors'
import { etag } from 'hono/etag'
import { logger as honoRequestLogger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { timing } from 'hono/timing'
import { trimTrailingSlash } from 'hono/trailing-slash'
import type { Logger } from 'pino'
import { errorHandler, notFoundHandler } from './error-handler.js'
import { requestLogger } from './request-logger.js'
import { validationHook } from './validation-hook.js'

interface CreateAppOptions {
	basePath: string
	title: string
	description: string
	port: number
	cors?: Parameters<typeof cors>[0]
	/**
	 * Service-scoped Pino logger. When set, Hono's built-in request logger
	 * is replaced with structured access logs (JSON, with `service`,
	 * `requestId`, method, path, status, and durationMs). Routes can read
	 * a request-scoped child logger via `c.get('logger')`.
	 */
	logger?: Logger
}

export function createApp<E extends Env = Env>(options: CreateAppOptions): OpenAPIHono<E> {
	const app = new OpenAPIHono<E>({ defaultHook: validationHook })

	app.use(trimTrailingSlash())

	app.use('*', cors(options.cors))
	app.use('*', secureHeaders())
	app.use('*', options.logger ? requestLogger(options.logger) : honoRequestLogger())
	app.use('*', timing())

	const compressMw = compress()
	const etagMw = etag()

	// compress() and etag() buffer the response body, which breaks SSE streams.
	// Skip both when the handler is producing text/event-stream.
	app.use('*', async (c, next) => {
		await next()

		if (c.res.headers.get('Content-Type')?.includes('text/event-stream')) return

		await compressMw(c, async () => {})
		await etagMw(c, async () => {})
	})

	app.get(options.basePath, (c) =>
		c.json({
			service: options.title.toLowerCase(),
			openApi: `${options.basePath}/openapi.json`,
			docs: `${options.basePath}/docs`,
		}),
	)

	app.get(`${options.basePath}/docs`, swaggerUI({ url: `${options.basePath}/openapi.json` }))

	app.doc(`${options.basePath}/openapi.json`, {
		openapi: '3.0.0',
		info: { title: options.title, description: options.description, version: '0.1.0' },
		servers: [{ url: `http://localhost:${options.port}`, description: 'Local development' }],
	})

	app.onError(errorHandler)
	app.notFound(notFoundHandler)

	return app
}
