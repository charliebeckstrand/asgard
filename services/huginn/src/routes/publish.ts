import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

import { ErrorSchema, EventSchema, PublishEventSchema } from '../lib/schemas.js'
import { apiKeyAuth } from '../middleware/auth.js'
import { publishEvent } from '../services/delivery.js'

const publishRoute = createRoute({
	method: 'post',
	path: '/publish',
	tags: ['Events'],
	summary: 'Publish an event',
	description: 'Publish an event to a topic. Subscribers will be notified via their callback URLs.',
	security: [{ Bearer: [] }],
	request: {
		body: {
			content: { 'application/json': { schema: PublishEventSchema } },
			required: true,
		},
	},
	responses: {
		202: {
			content: { 'application/json': { schema: EventSchema } },
			description: 'Event accepted for delivery',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

export const publish = new OpenAPIHono()

publish.use('/publish', apiKeyAuth())

publish.openapi(publishRoute, async (c) => {
	const body = c.req.valid('json')

	const event = await publishEvent(body)

	return c.json(event, 202)
})
