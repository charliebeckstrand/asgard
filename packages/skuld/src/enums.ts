import { z } from '@hono/zod-openapi'

export const HealthStatusSchema = z
	.enum(['healthy', 'degraded', 'unhealthy'])
	.openapi({ description: 'Service health status' })

export type HealthStatus = z.infer<typeof HealthStatusSchema>

export const ConnectionStatusSchema = z
	.enum(['up', 'down', 'unknown'])
	.openapi({ description: 'Connection status' })

export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>
