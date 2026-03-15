import { randomUUID } from 'node:crypto'
import { EventType } from '@ag-ui/core'
import { EventEncoder } from '@ag-ui/encoder'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { validationHook } from 'grid'
import { requireSession, type SessionEnv } from '../middleware/session.js'

const AgentMessageRequestSchema = z
	.object({
		type: z.literal('user'),
		message: z.string().min(1),
	})
	.openapi('AgentMessageRequest')

const agentRoute = createRoute({
	method: 'post',
	path: '/agent',
	tags: ['Chat'],
	summary: 'Send a message to the chat agent',
	request: {
		body: {
			content: { 'application/json': { schema: AgentMessageRequestSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			description: 'AG-UI event stream',
			content: {
				'text/event-stream': {
					schema: z.any(),
				},
			},
		},
	},
})

const chatAgentRoutes = new OpenAPIHono<SessionEnv>({ defaultHook: validationHook })

chatAgentRoutes.use('*', requireSession())

chatAgentRoutes.openapi(agentRoute, async (c) => {
	const { message } = c.req.valid('json')

	const encoder = new EventEncoder()

	const runId = randomUUID()
	const messageId = randomUUID()

	const stream = new ReadableStream({
		start(controller) {
			const send = (event: Parameters<typeof encoder.encode>[0]) => {
				controller.enqueue(encoder.encode(event))
			}

			send({ type: EventType.RUN_STARTED, runId })

			send({
				type: EventType.TEXT_MESSAGE_START,
				messageId,
				role: 'assistant',
			})

			send({
				type: EventType.TEXT_MESSAGE_CONTENT,
				messageId,
				delta: `Echo: ${message}`,
			})

			send({ type: EventType.TEXT_MESSAGE_END, messageId })

			send({ type: EventType.RUN_FINISHED, runId })

			controller.close()
		},
	})

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	})
})

export { chatAgentRoutes }
