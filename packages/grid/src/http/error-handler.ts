import { STATUS_CODES } from 'node:http'
import type { Context, Env } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { RequestLoggerEnv } from './request-logger.js'

export function errorBody(status: number, message: string, error?: string, code?: string) {
	return {
		error: error ?? STATUS_CODES[status] ?? 'Error',
		message,
		statusCode: status,
		...(code ? { code } : {}),
	}
}

function logError<E extends Env>(c: Context<E>, err: Error, message: string) {
	// The request logger, when the app has one, ties the error to its request ID.
	const logger = (c.var as Partial<RequestLoggerEnv['Variables']>).logger

	if (logger) logger.error({ err }, message)
	else console.error(`${message}: ${err.message}`, err.stack)
}

export function errorHandler<E extends Env>(err: Error, c: Context<E>) {
	// Only an HTTPException is meant for the client. Another error that happens
	// to carry a `status`, such as one from an SDK, stays internal.
	if (err instanceof HTTPException) {
		const status = err.status as ContentfulStatusCode

		if (status >= 500) logError(c, err, 'request failed')

		// An error with a string `code`, such as an auth error, names itself so a
		// client can act on it without matching the message.
		const code = 'code' in err && typeof err.code === 'string' ? err.code : undefined

		// Hono's own middleware, such as bearerAuth, throws with no message.
		const message = err.message || (STATUS_CODES[status] ?? 'Error')

		const res = c.json(errorBody(status, message, undefined, code), status)

		// An exception built around a response, such as bearerAuth's, keeps its
		// headers (`WWW-Authenticate`, `Retry-After`). The body stays JSON.
		err.res?.headers.forEach((value, name) => {
			if (name !== 'content-length' && !res.headers.has(name)) res.headers.set(name, value)
		})

		return res
	}

	logError(c, err, 'unhandled error')

	return c.json(errorBody(500, 'An unexpected error occurred'), 500)
}

export function notFoundHandler<E extends Env>(c: Context<E>) {
	return c.json(errorBody(404, `Route ${c.req.method} ${c.req.path} not found`), 404)
}
