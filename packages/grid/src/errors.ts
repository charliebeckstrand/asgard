import type { Context } from 'hono'

export function errorHandler(err: Error, c: Context) {
	if ('status' in err && typeof err.status === 'number') {
		return c.json(
			{
				error: err.name,
				message: err.message,
				statusCode: err.status,
			},
			err.status as 400,
		)
	}

	console.error(`Unhandled error: ${err.message}`, err.stack)

	return c.json(
		{
			error: 'Internal Server Error',
			message: err.message,
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
