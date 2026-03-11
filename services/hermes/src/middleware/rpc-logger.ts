import type { MiddlewareHandler } from 'hono'

import { huginnBreaker, vidarBreaker } from '../lib/upstream.js'

function getUpstreamService(path: string): string | null {
	if (path.includes('/events')) return 'huginn'

	if (path.includes('/security')) return 'vidar'

	return null
}

export function rpcLogger(): MiddlewareHandler {
	return async (c, next) => {
		const start = Date.now()
		const service = getUpstreamService(c.req.path)

		await next()

		const duration = Date.now() - start
		const breaker = service === 'huginn' ? huginnBreaker : service === 'vidar' ? vidarBreaker : null
		const breakerState = breaker?.getStatus().state ?? 'n/a'

		console.info(
			`[hermes] ${c.req.method} ${c.req.path} → ${service ?? 'local'} | ${c.res.status} | ${duration}ms | circuit: ${breakerState}`,
		)
	}
}
