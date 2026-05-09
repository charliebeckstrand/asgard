import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { HttpError } from 'grid'
import { AnalyzeRequestSchema, ErrorSchema } from '../lib/schemas.js'

const analyzeRoute = createRoute({
	method: 'post',
	path: '/analyze',
	tags: ['AI Analysis'],
	summary: 'Trigger AI threat analysis',
	description:
		'Run AI-powered analysis on recent security events. Not yet implemented; returns 501.',
	security: [{ Bearer: [] }],
	request: {
		body: {
			content: { 'application/json': { schema: AnalyzeRequestSchema } },
			required: true,
		},
	},
	responses: {
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
		501: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'AI analysis not implemented',
		},
	},
})

const app = new OpenAPIHono()

export const analyze = app.openapi(analyzeRoute, () => {
	throw new HttpError(501, 'AI analysis is not implemented', 'Not Implemented')
})
