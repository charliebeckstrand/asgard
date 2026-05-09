import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { listThreats } from '../handlers/threats.js'
import { errorResponse, jsonResponse, ThreatListSchema } from '../lib/schemas.js'

const listThreatsRoute = createRoute({
	method: 'get',
	path: '/threats',
	tags: ['Threats'],
	summary: 'List detected threats',
	description: 'Returns detected threat incidents, optionally filtered by resolution status or IP.',
	security: [{ Bearer: [] }],
	request: {
		query: z.object({
			resolved: z
				.enum(['true', 'false'])
				.optional()
				.openapi({ description: 'Filter by resolved status' }),
			ip: z.string().optional().openapi({ description: 'Filter by IP address' }),
		}),
	},
	responses: {
		200: jsonResponse(ThreatListSchema, 'List of threats'),
		401: errorResponse('Unauthorized'),
	},
})

const app = new OpenAPIHono()

export const threats = app.openapi(listThreatsRoute, async (c) => {
	const { resolved, ip } = c.req.valid('query')

	const result = await listThreats({
		resolved: resolved !== undefined ? resolved === 'true' : undefined,
		ip,
	})

	return c.json(result, 200)
})
