import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { errorResponse, jsonResponse } from 'grid'
import { toList } from 'skuld'
import { getRules } from '../handlers/rules.js'
import { RuleListSchema } from '../lib/schemas.js'

const listRulesRoute = createRoute({
	method: 'get',
	path: '/rules',
	tags: ['Rules'],
	summary: 'List predefined rules',
	description: 'Returns all predefined security rules and their current configuration.',
	security: [{ Bearer: [] }],
	responses: {
		200: jsonResponse(RuleListSchema, 'List of rules'),
		401: errorResponse('Unauthorized'),
	},
})

const app = new OpenAPIHono()

export const rules = app.openapi(listRulesRoute, (c) => {
	return c.json(toList(getRules()), 200)
})
