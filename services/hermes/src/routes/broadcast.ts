import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { broadcast } from '../lib/channels.js'
import { BroadcastMessageSchema, BroadcastResultSchema, ErrorSchema } from '../lib/schemas.js'

const broadcastRoute = createRoute({
	method: 'post',
	path: '/broadcast',
	tags: ['Messaging'],
	summary: 'Broadcast message to all clients',
	description: 'Sends a message to all connected WebSocket clients across all channels',
	request: {
		body: {
			content: { 'application/json': { schema: BroadcastMessageSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { 'application/json': { schema: BroadcastResultSchema } },
			description: 'Broadcast sent successfully',
		},
		400: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Invalid request body',
		},
	},
})

export const broadcastMessage = new OpenAPIHono().openapi(broadcastRoute, async (c) => {
	const { data, source } = c.req.valid('json')

	const recipients = broadcast(data, source)

	return c.json(
		{
			message: 'Broadcast sent',
			recipients,
		},
		200,
	)
})
