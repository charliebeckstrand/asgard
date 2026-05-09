import { randomUUID } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import type { Logger } from 'pino'

export interface RequestLoggerEnv {
	Variables: {
		requestId: string
		logger: Logger
	}
}

const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Hono middleware that creates a request-scoped child logger and emits a
 * structured access-log line when the response completes. The request ID
 * is taken from the `X-Request-Id` header when present and echoed back on
 * the response so callers can stitch traces across services.
 *
 * Routes can read `c.get('logger')` for a child logger pre-bound with the
 * request ID, or `c.get('requestId')` for the bare value.
 */
export function requestLogger(baseLogger: Logger): MiddlewareHandler<RequestLoggerEnv> {
	return async (c, next) => {
		const incoming = c.req.header(REQUEST_ID_HEADER)

		const requestId = incoming ?? randomUUID()

		const logger = baseLogger.child({ requestId })

		c.set('requestId', requestId)
		c.set('logger', logger)

		c.header(REQUEST_ID_HEADER, requestId)

		const start = Date.now()

		try {
			await next()
		} finally {
			logger.info(
				{
					method: c.req.method,
					path: c.req.path,
					status: c.res.status,
					durationMs: Date.now() - start,
				},
				'http request',
			)
		}
	}
}
