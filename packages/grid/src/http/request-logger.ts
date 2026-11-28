import type { MiddlewareHandler } from 'hono'
import type { RequestIdVariables } from 'hono/request-id'
import type { Logger } from '../log/logger.js'

export type RequestLoggerEnv = {
	Variables: RequestIdVariables & {
		logger: Logger
	}
}

interface RequestLoggerOptions {
	/** A path, such as the health check's, that gets no access-log line. */
	skipPath?: string
}

/**
 * Hono middleware that creates a request-scoped child logger, bound to the
 * request ID that Hono's `requestId()` middleware set, and emits a structured
 * access-log line when the response completes.
 *
 * Routes can read `c.get('logger')` for the child logger.
 */
export function requestLogger(
	baseLogger: Logger,
	{ skipPath }: RequestLoggerOptions = {},
): MiddlewareHandler<RequestLoggerEnv> {
	return async (c, next) => {
		const logger = baseLogger.child({ requestId: c.var.requestId })

		c.set('logger', logger)

		if (c.req.path === skipPath) return next()

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
