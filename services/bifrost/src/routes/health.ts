import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getPool } from '../lib/db.js'

// --- Schema ---

const ServiceStatusSchema = z.object({
	status: z.enum(['up', 'down', 'unknown']),
	latency: z.number().optional(),
})

const HealthResponseSchema = z
	.object({
		status: z.enum(['healthy', 'degraded', 'unhealthy']),
		version: z.string(),
		uptime: z.number(),
		services: z.record(z.string(), ServiceStatusSchema),
	})
	.openapi('HealthResponse')

// --- Route ---

const healthRoute = createRoute({
	method: 'get',
	path: '/health',
	tags: ['System'],
	summary: 'Health check',
	description: 'Returns the health status of the gateway and its database',
	responses: {
		200: {
			content: { 'application/json': { schema: HealthResponseSchema } },
			description: 'Service is healthy or degraded',
		},
		503: {
			content: { 'application/json': { schema: HealthResponseSchema } },
			description: 'Service is unhealthy',
		},
	},
})

// --- Handler ---

const startTime = Date.now()

type ServiceStatus = z.infer<typeof ServiceStatusSchema>

export const health = new OpenAPIHono().openapi(healthRoute, async (c) => {
	const uptimeSeconds = (Date.now() - startTime) / 1000

	const services: Record<string, ServiceStatus> = {}

	const dbStart = Date.now()

	let dbHealthy: boolean

	try {
		await getPool().query('SELECT 1')

		dbHealthy = true
	} catch {
		dbHealthy = false
	}

	const dbLatency = Date.now() - dbStart

	services.database = { status: dbHealthy ? 'up' : 'down', latency: dbLatency }

	const allUp = Object.values(services).every((s) => s.status === 'up')
	const allDown = Object.values(services).every((s) => s.status === 'down')

	let status: 'healthy' | 'degraded' | 'unhealthy'

	if (allUp) {
		status = 'healthy'
	} else if (allDown) {
		status = 'unhealthy'
	} else {
		status = 'degraded'
	}

	const statusCode = status === 'unhealthy' ? 503 : 200

	return c.json(
		{
			status,
			version: '0.1.0',
			uptime: uptimeSeconds,
			services,
		},
		statusCode,
	)
})
