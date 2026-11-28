import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import type { Env } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import type { BlankEnv } from 'hono/types'
import type { Logger } from '../log/logger.js'
import { errorBody, errorHandler, notFoundHandler } from './error-handler.js'
import { type RequestLoggerEnv, requestLogger } from './request-logger.js'
import { validationHook } from './validation-hook.js'

interface CreateAppOptions {
	basePath: string
	title: string
	description?: string
	/** Only for a service that browsers call. A private one sends no CORS headers. */
	cors?: Parameters<typeof cors>[0]
	/**
	 * Service-scoped Pino logger, for structured access logs (JSON, with
	 * `service`, `requestId`, method, path, status, and durationMs). Routes can
	 * read a request-scoped child logger via `c.get('logger')`.
	 */
	logger: Logger
}

const MAX_BODY_BYTES = 64 * 1024

/**
 * A router whose invalid requests get the shared error body. Hono applies the
 * validation hook of the router a route is added to, not the app it is mounted
 * on, so every router needs its own. `/x/` matches `/x`.
 */
export function createRouter<E extends Env = Env>(): OpenAPIHono<E> {
	return new OpenAPIHono<E>({ defaultHook: validationHook, strict: false })
}

export function createApp<E extends Env = BlankEnv>(
	options: CreateAppOptions,
): OpenAPIHono<E & RequestLoggerEnv> {
	const app = createRouter<E & RequestLoggerEnv>()

	// First, so every later middleware's errors are logged with the request ID.
	app.use('*', requestId())
	app.use('*', requestLogger(options.logger, { skipPath: `${options.basePath}/health` }))

	if (options.cors) app.use('*', cors(options.cors))

	app.use('*', secureHeaders())

	// Bodies are read into memory before validation, so an unbounded one could
	// exhaust the process. Every service takes small JSON bodies.
	app.use(
		'*',
		bodyLimit({
			maxSize: MAX_BODY_BYTES,
			onError: (c) => c.json(errorBody(413, 'Request body too large'), 413),
		}),
	)

	app.use('*', compress())

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
		info: { title: options.title, description: options.description ?? '', version: '0.1.0' },
	})

	app.onError(errorHandler)
	app.notFound(notFoundHandler)

	return app
}
