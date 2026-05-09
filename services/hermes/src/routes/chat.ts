import { randomUUID } from 'node:crypto'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { HttpError, validationHook } from 'grid'
import { streamSSE } from 'hono/streaming'
import { ErrorSchema } from 'skuld'
import { createChatRepository } from '../lib/chat-repository.js'
import { type AuthEnv, requireAuth } from '../middleware/auth.js'

const chatRepository = createChatRepository()

const ChatIdParamSchema = z.object({
	id: z.string().uuid(),
})

const ChatMessageResponseSchema = z
	.object({
		id: z.string(),
		chat_id: z.string(),
		role: z.enum(['user', 'agent']),
		type: z.string(),
		content: z.string(),
		created_at: z.string(),
	})
	.openapi('ChatMessageResponse')

const ChatResponseSchema = z
	.object({
		id: z.string(),
		created_at: z.string(),
		updated_at: z.string(),
	})
	.openapi('ChatResponse')

const ChatDetailResponseSchema = z
	.object({
		id: z.string(),
		created_at: z.string(),
		updated_at: z.string(),
		messages: z.array(ChatMessageResponseSchema),
	})
	.openapi('ChatDetailResponse')

const CreateMessageRequestSchema = z
	.object({
		content: z.string().min(1),
	})
	.openapi('CreateMessageRequest')

const listChatsRoute = createRoute({
	method: 'get',
	path: '/',
	tags: ['Chat'],
	security: [{ Bearer: [] }],
	summary: 'List all chats',
	responses: {
		200: {
			content: { 'application/json': { schema: z.array(ChatResponseSchema) } },
			description: 'List of chats',
		},
	},
})

const getChatRoute = createRoute({
	method: 'get',
	path: '/{id}',
	tags: ['Chat'],
	security: [{ Bearer: [] }],
	summary: 'Get a chat with messages',
	request: {
		params: ChatIdParamSchema,
	},
	responses: {
		200: {
			content: { 'application/json': { schema: ChatDetailResponseSchema } },
			description: 'Chat with messages',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Chat not found',
		},
	},
})

const postMessageRoute = createRoute({
	method: 'post',
	path: '/{id}',
	tags: ['Chat'],
	security: [{ Bearer: [] }],
	summary: 'Send a message and stream the agent response',
	request: {
		params: ChatIdParamSchema,
		body: {
			content: { 'application/json': { schema: CreateMessageRequestSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { 'text/event-stream': { schema: z.any() } },
			description: 'SSE stream of agent response',
		},
		400: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Validation error',
		},
	},
})

const deleteChatRoute = createRoute({
	method: 'delete',
	path: '/{id}',
	tags: ['Chat'],
	security: [{ Bearer: [] }],
	summary: 'Delete a chat',
	request: {
		params: ChatIdParamSchema,
	},
	responses: {
		204: {
			description: 'Chat deleted',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Chat not found',
		},
	},
})

const chatRoutes = new OpenAPIHono<AuthEnv>({ defaultHook: validationHook })

chatRoutes.use('*', requireAuth())

chatRoutes.openapi(listChatsRoute, async (c) => {
	const userId = c.get('userId')

	const chats = await chatRepository.getChats(userId)

	return c.json(chats, 200)
})

chatRoutes.openapi(getChatRoute, async (c) => {
	const { id } = c.req.valid('param')
	const userId = c.get('userId')

	const chat = await chatRepository.getChatById(id, userId)

	if (!chat) {
		throw new HttpError(404, 'Chat not found', 'Not Found')
	}

	return c.json(chat, 200)
})

chatRoutes.openapi(postMessageRoute, async (c) => {
	const { id: chatId } = c.req.valid('param')
	const { content } = c.req.valid('json')
	const userId = c.get('userId')

	const existingChat = await chatRepository.getChatById(chatId, userId)

	if (!existingChat) {
		await chatRepository.insertChat(chatId, userId)
	}

	const userMessage = await chatRepository.insertMessage(
		randomUUID(),
		chatId,
		'user',
		'text',
		content,
	)

	// TODO: Replace with real agent/LLM call
	const agentReply = `You said: ${content}`

	return streamSSE(c, async (stream) => {
		await stream.writeSSE({
			event: 'user_message',
			data: JSON.stringify(userMessage),
			id: userMessage.id,
		})

		await stream.writeSSE({
			event: 'content',
			data: agentReply,
			id: randomUUID(),
		})

		const agentMessage = await chatRepository.insertMessage(
			randomUUID(),
			chatId,
			'agent',
			'text',
			agentReply,
		)

		await stream.writeSSE({
			event: 'done',
			data: JSON.stringify(agentMessage),
			id: agentMessage.id,
		})
	})
})

chatRoutes.openapi(deleteChatRoute, async (c) => {
	const { id } = c.req.valid('param')
	const userId = c.get('userId')

	const deleted = await chatRepository.deleteChat(id, userId)

	if (!deleted) {
		throw new HttpError(404, 'Chat not found', 'Not Found')
	}

	return c.body(null, 204)
})

export { chatRoutes }
