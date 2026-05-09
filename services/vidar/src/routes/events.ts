import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { ingestEvent } from '../handlers/events.js'
import {
	errorResponse,
	IngestEventSchema,
	jsonResponse,
	SecurityEventSchema,
} from '../lib/schemas.js'

const ingestRoute = createRoute({
	method: 'post',
	path: '/events',
	tags: ['Events'],
	summary: 'Ingest a security event',
	description:
		'Report a security event for monitoring. Events are stored and evaluated against predefined rules.',
	security: [{ Bearer: [] }],
	request: {
		body: {
			content: { 'application/json': { schema: IngestEventSchema } },
			required: true,
		},
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
