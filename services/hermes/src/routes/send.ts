import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { send } from '../lib/channels.js'
import { ErrorSchema, SendMessageSchema, SendResultSchema } from '../lib/schemas.js'

const sendRoute = createRoute({
	method: 'post',
	path: '/send',
	tags: ['Messaging'],
	summary: 'Send message to a channel',
	description: 'Sends a message to all subscribers of a specific channel',
	request: {
		body: {
			content: { 'application/json': { schema: SendMessageSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { 'application/json': { schema: SendResultSchema } },
			description: 'Message sent successfully',
		},
		400: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Invalid request body',
		},
	},
})

export const sendMessage = new OpenAPIHono().openapi(sendRoute, async (c) => {
	const { channel, data, source } = c.req.valid('json')

	const recipients = send(channel, data, source)

	return c.json(
		{
			message: 'Message sent',
			channel,
			recipients,
		},
		200,
	)
})
