import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

import { AggregateHealthSchema } from '../lib/schemas.js'
import { getHuginnClient, getVidarClient, huginnBreaker, vidarBreaker } from '../lib/upstream.js'

const startTime = Date.now()

const healthRoute = createRoute({
	method: 'get',
	path: '/health',
	tags: ['System'],
	summary: 'Aggregate health check',
	description:
		'Returns health status of Hermes and all downstream services with circuit breaker states.',
	responses: {
		200: {
			content: { 'application/json': { schema: AggregateHealthSchema } },
			description: 'Aggregate health status',
		},
	},
})

interface ServiceHealth {
	status: 'healthy' | 'degraded' | 'unreachable'
	latency?: number
}

async function checkService(fn: () => Promise<Response>): Promise<ServiceHealth> {
	const start = Date.now()

	try {
		const res = await fn()

		const latency = Date.now() - start

		if (res.ok) {
			return { status: latency > 2000 ? 'degraded' : 'healthy', latency }
		}

		return { status: 'degraded', latency }
	} catch {
		return { status: 'unreachable' }
	}
}

export const health = new OpenAPIHono().openapi(healthRoute, async (c) => {
	const [huginn, vidar] = await Promise.all([
		checkService(() =>
			getHuginnClient().events.health.$get({}, { init: { signal: AbortSignal.timeout(5_000) } }),
		),
		checkService(() =>
			getVidarClient().vidar.health.$get({}, { init: { signal: AbortSignal.timeout(5_000) } }),
		),
	])

	const huginnStatus = huginnBreaker.getStatus()
	const vidarStatus = vidarBreaker.getStatus()

	const anyUnreachable = huginn.status === 'unreachable' || vidar.status === 'unreachable'
	const anyDegraded = huginn.status === 'degraded' || vidar.status === 'degraded'

	const overallStatus = anyUnreachable ? 'unhealthy' : anyDegraded ? 'degraded' : 'healthy'

	return c.json(
		{
			status: overallStatus as 'healthy' | 'degraded' | 'unhealthy',
			version: '0.1.0',
			uptime: (Date.now() - startTime) / 1000,
			services: { huginn, vidar },
			circuitBreakers: {
				huginn: { state: huginnStatus.state, failures: huginnStatus.failures },
				vidar: { state: vidarStatus.state, failures: vidarStatus.failures },
			},
		},
		200,
	)
})
