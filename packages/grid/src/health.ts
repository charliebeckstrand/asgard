import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { HealthStatusSchema } from 'skuld'

export const HealthResponseSchema = z
	.object({
		status: HealthStatusSchema,
		version: z.string(),
		uptime: z.number(),
	})
	.openapi('HealthResponse')

export function createHealthRoute(options?: {
	description?: string
	check?: () => Promise<Record<string, unknown>>
}) {
	const startTime = Date.now()

	const healthRoute = createRoute({
		method: 'get',
		path: '/health',
		tags: ['System'],
		summary: 'Health check',
		description: options?.description ?? 'Returns the health status of the service',
		responses: {
			200: {
				content: { 'application/json': { schema: HealthResponseSchema } },
				description: 'Service is healthy',
			},
		},
	})

	return new OpenAPIHono().openapi(healthRoute, async (c) => {
		const uptimeSeconds = (Date.now() - startTime) / 1000

		const extra = options?.check ? await options.check() : {}

		return c.json(
			{
				status: 'healthy' as const,
				version: '0.1.0',
				uptime: uptimeSeconds,
				...extra,
			},
			200,
		)
	})
}
