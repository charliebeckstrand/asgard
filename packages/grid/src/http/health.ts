import { createRoute, z } from '@hono/zod-openapi'
import { ConnectionStatusSchema, HealthStatusSchema } from 'skuld'
import { createRouter } from './create-app.js'
import { jsonResponse } from './responses.js'

const ServiceStatusSchema = z.object({
	status: ConnectionStatusSchema,
	latency: z.number(),
})

type ServiceStatus = z.infer<typeof ServiceStatusSchema>

export const HealthResponseSchema = z
	.object({
		status: HealthStatusSchema,
		version: z.string(),
		uptime: z.number(),
		services: z.record(z.string(), ServiceStatusSchema),
	})
	.openapi('HealthResponse')

export type HealthResponse = z.infer<typeof HealthResponseSchema>

// The commit the running build came from. App Platform sets COMMIT_HASH; anywhere
// else the build is local.
const version = process.env.COMMIT_HASH || 'dev'

type ServiceProbe = () => Promise<{ up: boolean }>

interface CreateHealthRouteOptions {
	description?: string
	/** What the service depends on, by name. The service is unhealthy when all are down. */
	services: Record<string, ServiceProbe>
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

export function createHealthRoute({ description, services }: CreateHealthRouteOptions) {
	const healthRoute = createRoute({
		method: 'get',
		path: '/health',
		tags: ['System'],
		summary: 'Health check',
		description: description ?? 'Returns the health status of the service',
		responses: {
			200: jsonResponse(HealthResponseSchema, 'Service is healthy or degraded'),
			503: jsonResponse(HealthResponseSchema, 'Service is unhealthy'),
		},
	})

	return createRouter().openapi(healthRoute, async (c) => {
		const entries = await Promise.all(
			Object.entries(services).map(async ([name, probe]) => [name, await runProbe(probe)] as const),
		)

		const statuses = Object.fromEntries(entries)

		const status = aggregateStatus(statuses)

		return c.json(
			{ status, version, uptime: process.uptime(), services: statuses },
			status === 'unhealthy' ? 503 : 200,
		)
	})
}
