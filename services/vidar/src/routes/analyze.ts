import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { getAnalyzer } from '../handlers/analyzer.js'
import { environment } from '../lib/env.js'
import { AnalyzeRequestSchema, AnalyzeResponseSchema, ErrorSchema } from '../lib/schemas.js'
import { apiKeyAuth } from '../middleware/api-key.js'

const analyzeRoute = createRoute({
	method: 'post',
	path: '/analyze',
	tags: ['AI Analysis'],
	summary: 'Trigger AI threat analysis',
	description:
		'Run AI-powered analysis on recent security events. Requires AI_ENABLED=true and a configured AI provider.',
	security: [{ Bearer: [] }],
	request: {
		body: {
			content: { 'application/json': { schema: AnalyzeRequestSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { 'application/json': { schema: AnalyzeResponseSchema } },
			description: 'Analysis result',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
		501: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'AI analysis not enabled',
		},
	},
})

const app = new OpenAPIHono()

app.use('/analyze', apiKeyAuth())

export const analyze = app.openapi(analyzeRoute, async (c) => {
	const env = environment()

	if (!env.AI_ENABLED) {
		return c.json(
			{
				error: 'Not Implemented',
				message: 'AI analysis is not enabled. Set AI_ENABLED=true and configure an AI provider.',
				statusCode: 501,
			},
			501,
		)
	}

	const { ip } = c.req.valid('json')

	const analyzer = getAnalyzer()

	const result = await analyzer.analyze({ ip })

	return c.json(result, 200)
})
