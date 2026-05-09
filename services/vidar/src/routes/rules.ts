import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { getRules } from '../handlers/rules.js'
import { ErrorSchema, jsonResponse, RuleListSchema } from '../lib/schemas.js'

const listRulesRoute = createRoute({
	method: 'get',
	path: '/rules',
	tags: ['Rules'],
	summary: 'List predefined rules',
	description: 'Returns all predefined security rules and their current configuration.',
	security: [{ Bearer: [] }],
	responses: {
		200: jsonResponse(RuleListSchema, 'List of rules'),
		401: jsonResponse(ErrorSchema, 'Unauthorized'),
	},
})

const app = new OpenAPIHono()

export const rules = app.openapi(listRulesRoute, (c) => {
	const allRules = getRules()

	return c.json({ data: allRules, total: allRules.length }, 200)
})
