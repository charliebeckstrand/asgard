import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { getConfig } from '../config.js'
import { DetailSchema, HealthResponseSchema } from '../schemas.js'

const healthRoute = createRoute({
	method: 'get',
	path: '/health',
	tags: ['System'],
	summary: 'Health check',
	description: 'Verifies database connectivity and returns service status',
	responses: {
		200: {
			content: { 'application/json': { schema: HealthResponseSchema } },
			description: 'Service is healthy',
		},
		500: {
			content: { 'application/json': { schema: DetailSchema } },
			description: 'Service is unhealthy',
		},
	},
})

export const health = new OpenAPIHono().openapi(healthRoute, async (c) => {
	const pool = getConfig().getPool()

	await pool.query('SELECT 1')

	return c.json({ status: 'ok', service: 'heimdall' }, 200)
})
