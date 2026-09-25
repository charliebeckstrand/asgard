import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { errorResponse, jsonRequest, jsonResponse } from 'grid'
import { IngestEventSchema, IpAddressSchema, SecurityEventSchema } from 'skuld'
import { ingestEvent, listEvents } from '../handlers/events.js'
import { SecurityEventListSchema } from '../lib/schemas.js'

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

const listRoute = createRoute({
	method: 'get',
	path: '/events',
	tags: ['Events'],
	summary: 'List recent security events',
	description: 'Returns the most recent events, newest first, optionally filtered by IP or type.',
	security: [{ Bearer: [] }],
	request: {
		query: z.object({
			ip: IpAddressSchema.optional().openapi({ description: 'Filter by IP address' }),
			event_type: z.string().min(1).optional().openapi({ description: 'Filter by event type' }),
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.max(500)
				.default(100)
				.openapi({ description: 'Maximum number of events to return' }),
		}),
	},
	responses: {
		200: jsonResponse(SecurityEventListSchema, 'List of events'),
		401: errorResponse('Unauthorized'),
	},
})

const app = new OpenAPIHono()

export const events = app
	.openapi(ingestRoute, async (c) => {
		const body = c.req.valid('json')

		const event = await ingestEvent(body)

		return c.json(event, 201)
	})
	.openapi(listRoute, async (c) => {
		const result = await listEvents(c.req.valid('query'))

		return c.json(result, 200)
	})
