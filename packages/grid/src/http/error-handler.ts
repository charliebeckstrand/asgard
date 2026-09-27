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

export function errorHandler<E extends Env>(err: Error, c: Context<E>) {
	// Only an HTTPException is meant for the client. Another error that happens
	// to carry a `status`, such as one from an SDK, stays internal.
	if (err instanceof HTTPException) {
		const status = err.status as ContentfulStatusCode

		// An error with a string `code`, such as an auth error, names itself so a
		// client can act on it without matching the message.
		const code = 'code' in err && typeof err.code === 'string' ? err.code : undefined

		return c.json(errorBody(status, err.message, undefined, code), status)
	}

	// The request logger, when the app has one, ties the error to its request ID.
	const logger = (c.var as Partial<RequestLoggerEnv['Variables']>).logger

	if (logger) logger.error({ err }, 'unhandled error')
	else console.error(`Unhandled error: ${err.message}`, err.stack)

	return c.json(errorBody(500, 'An unexpected error occurred'), 500)
}

export function notFoundHandler<E extends Env>(c: Context<E>) {
	return c.json(errorBody(404, `Route ${c.req.method} ${c.req.path} not found`), 404)
}
