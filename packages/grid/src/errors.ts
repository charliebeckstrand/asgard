import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export function errorHandler(err: Error, c: Context) {
	if ('status' in err && typeof err.status === 'number') {
		return c.json(
			{
				error: err.name,
				message: err.message,
				statusCode: err.status,
			},
			err.status as ContentfulStatusCode,
		)
	}

	console.error(`Unhandled error: ${err.message}`, err.stack)

	return c.json(
		{
			error: 'Internal Server Error',
			message: 'An unexpected error occurred',
			statusCode: 500,
		},
		500,
	)
}

export function notFoundHandler(c: Context) {
	return c.json(
		{
			error: 'Not Found',
			message: `Route ${c.req.method} ${c.req.path} not found`,
			statusCode: 404,
		},
		404,
	)
}
