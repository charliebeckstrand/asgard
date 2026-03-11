import type { MiddlewareHandler } from 'hono'

export function timing(): MiddlewareHandler {
	return async (c, next) => {
		const start = Date.now()

		await next()

		const duration = Date.now() - start

		c.res.headers.set('X-Response-Time', `${duration}ms`)

		if (duration > 1000) {
			console.warn(`[hermes] Slow request: ${c.req.method} ${c.req.path} took ${duration}ms`)
		}
	}
}
