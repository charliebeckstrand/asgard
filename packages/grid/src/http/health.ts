import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { ConnectionStatusSchema, HealthStatusSchema } from 'skuld'
import { jsonResponse } from './responses.js'

const ServiceStatusSchema = z.object({
	status: ConnectionStatusSchema,
	latency: z.number().optional(),
})

type ServiceStatus = z.infer<typeof ServiceStatusSchema>

export const HealthResponseSchema = z
	.object({
		status: HealthStatusSchema,
		version: z.string(),
		uptime: z.number(),
		services: z.record(z.string(), ServiceStatusSchema).optional(),
	})
	.openapi('HealthResponse')

type ServiceProbe = () => Promise<{ up: boolean }>

interface CreateHealthRouteOptions {
	description?: string
	check?: () => Promise<Record<string, unknown>>
	services?: Record<string, ServiceProbe>
}

async function runProbe(probe: ServiceProbe): Promise<ServiceStatus> {
	const start = Date.now()

	try {
		const { up } = await probe()

		return { status: up ? 'up' : 'down', latency: Date.now() - start }
	} catch {
		return { status: 'down', latency: Date.now() - start }
	}
}

function aggregateStatus(
	services: Record<string, ServiceStatus>,
): 'healthy' | 'degraded' | 'unhealthy' {
	const statuses = Object.values(services).map((s) => s.status)

	if (statuses.every((s) => s === 'up')) return 'healthy'
	if (statuses.every((s) => s === 'down')) return 'unhealthy'

	return 'degraded'
}

export function createHealthRoute(options?: CreateHealthRouteOptions) {
	const healthRoute = createRoute({
		method: 'get',
		path: '/health',
		tags: ['System'],
		summary: 'Health check',
		description: options?.description ?? 'Returns the health status of the service',
		responses: {
			200: jsonResponse(HealthResponseSchema, 'Service is healthy or degraded'),
			503: jsonResponse(HealthResponseSchema, 'Service is unhealthy'),
		},
	})

	return new OpenAPIHono().openapi(healthRoute, async (c) => {
		const uptimeSeconds = process.uptime()

		if (options?.services) {
			const entries = await Promise.all(
				Object.entries(options.services).map(
					async ([name, probe]) => [name, await runProbe(probe)] as const,
				),
			)

			const services = Object.fromEntries(entries)
			const status = aggregateStatus(services)

			return c.json(
				{ status, version: '0.1.0', uptime: uptimeSeconds, services },
				status === 'unhealthy' ? 503 : 200,
			)
		}

		const extra = options?.check ? await options.check() : {}

		return c.json(
			{ status: 'healthy' as const, version: '0.1.0', uptime: uptimeSeconds, ...extra },
			200,
		)
	})
}
