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
	security: [{ ApiKey: [] }],
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

export const rules = new OpenAPIHono()

rules.use('/rules', apiKeyAuth())

rules.openapi(listRulesRoute, (c) => {
	const allRules = getRules()

	return c.json({ data: allRules }, 200)
})
