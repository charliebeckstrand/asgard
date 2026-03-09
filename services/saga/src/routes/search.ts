import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { ErrorSchema, SearchQuerySchema, SearchResultSchema } from '../lib/schemas.js'
import { apiKeyAuth } from '../middleware/auth.js'
import { searchLogs } from '../services/search.js'

const searchRoute = createRoute({
	method: 'get',
	path: '/search',
	tags: ['Logs'],
	summary: 'Search logs',
	description: 'Query stored logs with optional filters for type, level, service, and time range',
	request: {
		query: SearchQuerySchema,
	},
	responses: {
		200: {
			content: { 'application/json': { schema: SearchResultSchema } },
			description: 'Search results',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

export const search = new OpenAPIHono()

search.use('/search', apiKeyAuth())

search.openapi(searchRoute, async (c) => {
	const query = c.req.valid('query')
	const result = await searchLogs(query)

	return c.json(result, 200)
})
