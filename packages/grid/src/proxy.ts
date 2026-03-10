import type { MiddlewareHandler } from 'hono'

interface ProxyOptions {
	timeout?: number
}

const HOP_BY_HOP_HEADERS = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
])

export function createProxy(targetUrl: string, options: ProxyOptions = {}): MiddlewareHandler {
	const { timeout = 30_000 } = options
	const base = targetUrl.replace(/\/$/, '')

	return async (c) => {
		const url = new URL(c.req.url)
		const upstream = `${base}${url.pathname}${url.search}`

		const headers = new Headers()

		for (const [key, value] of c.req.raw.headers.entries()) {
			if (key === 'host' || HOP_BY_HOP_HEADERS.has(key)) continue

			headers.set(key, value)
		}

		headers.set('X-Forwarded-For', c.req.header('x-forwarded-for') ?? c.env?.ip ?? '127.0.0.1')
		headers.set('X-Forwarded-Host', url.host)
		headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''))

		const hasBody = !['GET', 'HEAD'].includes(c.req.method)

		const res = await fetch(upstream, {
			method: c.req.method,
			headers,
			body: hasBody ? c.req.raw.body : undefined,
			signal: AbortSignal.timeout(timeout),
		})

		const responseHeaders = new Headers()

		for (const [key, value] of res.headers.entries()) {
			if (HOP_BY_HOP_HEADERS.has(key)) continue

			responseHeaders.set(key, value)
		}

		return new Response(res.body, {
			status: res.status,
			statusText: res.statusText,
			headers: responseHeaders,
		})
	}
}
