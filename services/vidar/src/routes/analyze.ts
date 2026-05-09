import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { errorResponse, HTTPException, jsonRequest } from 'grid'
import { AnalyzeRequestSchema } from '../lib/schemas.js'

const analyzeRoute = createRoute({
	method: 'post',
	path: '/analyze',
	tags: ['AI Analysis'],
	summary: 'Trigger AI threat analysis',
	description:
		'Run AI-powered analysis on recent security events. Not yet implemented; returns 501.',
	security: [{ Bearer: [] }],
	request: {
		body: jsonRequest(AnalyzeRequestSchema),
	},
	responses: {
		401: errorResponse('Unauthorized'),
		501: errorResponse('AI analysis not implemented'),
	},
})

const app = new OpenAPIHono()

export const analyze = app.openapi(analyzeRoute, () => {
	throw new HTTPException(501, { message: 'AI analysis is not implemented' })
})
