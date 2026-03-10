import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { ErrorSchema, IngestEventSchema, SecurityEventSchema } from '../lib/schemas.js'
import { apiKeyAuth } from '../middleware/api-key.js'
import { ingestEvent } from '../services/events.js'

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
		201: {
			content: { 'application/json': { schema: SecurityEventSchema } },
			description: 'Event ingested',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const app = new OpenAPIHono()

app.use('/events', apiKeyAuth())

export const events = app.openapi(ingestRoute, async (c) => {
	const body = c.req.valid('json')

	const event = await ingestEvent(body)

	return c.json(event, 201)
})
