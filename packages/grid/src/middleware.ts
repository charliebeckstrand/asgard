import type { Context, MiddlewareHandler } from 'hono'

export function requestLogger(): MiddlewareHandler {
	return async (c, next) => {
		const start = performance.now()

		await next()

		const duration = (performance.now() - start).toFixed(2)

		console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`)
	}
}

export function getClientIp(c: Context): string {
	const xff = c.req.header('x-forwarded-for')

	if (xff) {
		return xff.split(',')[0].trim()
	}

	return c.req.header('x-real-ip') ?? 'unknown'
}

export function securityHeaders(): MiddlewareHandler {
	return async (c, next) => {
		await next()

		c.header('X-Content-Type-Options', 'nosniff')
		c.header('X-Frame-Options', 'DENY')
		c.header('X-XSS-Protection', '0')
		c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
		c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
	}
}
