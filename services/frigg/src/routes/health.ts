import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { HealthResponseSchema } from '../lib/schemas.js'

const healthRoute = createRoute({
	method: 'get',
	path: '/health',
	tags: ['System'],
	summary: 'Health check',
	responses: {
		200: {
			content: { 'application/json': { schema: HealthResponseSchema } },
			description: 'Service is healthy',
		},
	},
})

export const health = new OpenAPIHono()

health.openapi(healthRoute, (c) => {
	return c.json({ status: 'ok', service: 'frigg' }, 200)
})
