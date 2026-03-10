import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { ErrorSchema, RuleListSchema } from '../lib/schemas.js'
import { apiKeyAuth } from '../middleware/api-key.js'
import { getRules } from '../services/rules.js'

const listRulesRoute = createRoute({
	method: 'get',
	path: '/rules',
	tags: ['Rules'],
	summary: 'List predefined rules',
	description: 'Returns all predefined security rules and their current configuration.',
	security: [{ Bearer: [] }],
	responses: {
		200: {
			content: { 'application/json': { schema: RuleListSchema } },
			description: 'List of rules',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const app = new OpenAPIHono()

app.use('/rules', apiKeyAuth())

export const rules = app.openapi(listRulesRoute, (c) => {
	const allRules = getRules()

	return c.json({ data: allRules }, 200)
})
