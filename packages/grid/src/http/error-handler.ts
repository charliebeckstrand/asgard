import { STATUS_CODES } from 'node:http'
import type { Context, Env } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export function errorBody(status: number, message: string, error?: string) {
	return { error: error ?? STATUS_CODES[status] ?? 'Error', message, statusCode: status }
}

export function errorHandler<E extends Env>(err: Error, c: Context<E>) {
	if ('status' in err && typeof err.status === 'number') {
		const status = err.status as ContentfulStatusCode

		return c.json(errorBody(status, err.message), status)
	}

	console.error(`Unhandled error: ${err.message}`, err.stack)

	return c.json(errorBody(500, 'An unexpected error occurred'), 500)
}

export function notFoundHandler<E extends Env>(c: Context<E>) {
	return c.json(errorBody(404, `Route ${c.req.method} ${c.req.path} not found`), 404)
}
