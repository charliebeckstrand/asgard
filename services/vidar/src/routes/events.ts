import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { errorResponse, jsonRequest, jsonResponse } from 'grid'
import { IngestEventSchema, SecurityEventSchema } from 'skuld'
import { ingestEvent } from '../handlers/events.js'

const ingestRoute = createRoute({
	method: 'post',
	path: '/events',
	tags: ['Events'],
	summary: 'Ingest a security event',
	description:
		'Report a security event for monitoring. Events are stored and evaluated against predefined rules.',
	security: [{ Bearer: [] }],
	request: {
		body: jsonRequest(IngestEventSchema),
	},
	responses: {
		201: jsonResponse(SecurityEventSchema, 'Event ingested'),
		401: errorResponse('Unauthorized'),
	},
})

const app = new OpenAPIHono()

export const events = app.openapi(ingestRoute, async (c) => {
	const body = c.req.valid('json')

	const event = await ingestEvent(body)

	return c.json(event, 201)
})
