import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

const HealthResponseSchema = z
	.object({
		status: z.enum(['healthy', 'degraded', 'unhealthy']),
		version: z.string(),
		uptime: z.number(),
	})
	.openapi('HealthResponse')

const healthRoute = createRoute({
	method: 'get',
	path: '/health',
	tags: ['System'],
	summary: 'Health check',
	description: 'Returns the health status of the event bus',
	responses: {
		200: {
			content: { 'application/json': { schema: HealthResponseSchema } },
			description: 'Service health status',
		},
	},
})

const startTime = Date.now()

export const health = new OpenAPIHono().openapi(healthRoute, async (c) => {
	const uptimeSeconds = (Date.now() - startTime) / 1000

	return c.json(
		{
			status: 'healthy' as const,
			version: '0.1.0',
			uptime: uptimeSeconds,
		},
		200,
	)
})
