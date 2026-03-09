import type { MiddlewareHandler } from 'hono'

export function requestLogger(): MiddlewareHandler {
	return async (c, next) => {
		const start = performance.now()

		await next()

		const duration = (performance.now() - start).toFixed(2)

		console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`)
	}
}
