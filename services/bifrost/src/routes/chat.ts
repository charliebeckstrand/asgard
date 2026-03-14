import { randomUUID } from 'node:crypto'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { validationHook } from 'grid'
import { ErrorSchema } from 'skuld'
import { verifyToken } from '../auth/jwt.js'
import { createChatRepository } from '../lib/chat-repository.js'
import { requireSession, type SessionEnv } from '../middleware/session.js'

const chatRepository = createChatRepository()

const ChatIdParamSchema = z.object({
	id: z.string().uuid(),
})

const ToolSchema = z
	.object({
		type: z.string(),
		data: z.string(),
	})
	.nullable()
	.openapi('Tool')

const ChatMessageResponseSchema = z
	.object({
		id: z.string(),
		chat_id: z.string(),
		role: z.enum(['user', 'agent']),
		message: z.string(),
		tool: ToolSchema,
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
		role: z.enum(['user', 'agent']),
		message: z.string().min(1),
		tool: z
			.object({
				type: z.string(),
				data: z.string(),
			})
			.optional(),
	})
	.openapi('CreateMessageRequest')

const listChatsRoute = createRoute({
	method: 'get',
	path: '/',
	tags: ['Chat'],
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
	summary: 'Post a message to a chat',
	request: {
		params: ChatIdParamSchema,
		body: {
			content: { 'application/json': { schema: CreateMessageRequestSchema } },
			required: true,
		},
	},
	responses: {
		201: {
			content: { 'application/json': { schema: ChatMessageResponseSchema } },
			description: 'Message created',
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

async function getUserId(c: {
	get: (key: 'session') => { accessToken: string } | null
}): Promise<string> {
	const session = c.get('session')

	if (!session) throw new Error('No session')

	const payload = await verifyToken(session.accessToken)

	return payload.sub as string
}

const chatRoutes = new OpenAPIHono<SessionEnv>({ defaultHook: validationHook })

chatRoutes.use('*', requireSession())

chatRoutes.openapi(listChatsRoute, async (c) => {
	const userId = await getUserId(c)

	const chats = await chatRepository.getChats(userId)

	return c.json(chats, 200)
})

chatRoutes.openapi(getChatRoute, async (c) => {
	const { id } = c.req.valid('param')
	const userId = await getUserId(c)

	const chat = await chatRepository.getChatById(id, userId)

	if (!chat) {
		return c.json({ error: 'Not Found', message: 'Chat not found', statusCode: 404 }, 404)
	}

	return c.json(chat, 200)
})

chatRoutes.openapi(postMessageRoute, async (c) => {
	const { id: chatId } = c.req.valid('param')
	const { role, message, tool } = c.req.valid('json')
	const userId = await getUserId(c)

	const existingChat = await chatRepository.getChatById(chatId, userId)

	if (!existingChat) {
		await chatRepository.insertChat(chatId, userId)
	}

	const chatMessage = await chatRepository.insertMessage(
		randomUUID(),
		chatId,
		role,
		message,
		tool ?? null,
	)

	return c.json(chatMessage, 201)
})

chatRoutes.openapi(deleteChatRoute, async (c) => {
	const { id } = c.req.valid('param')
	const userId = await getUserId(c)

	const deleted = await chatRepository.deleteChat(id, userId)

	if (!deleted) {
		return c.json({ error: 'Not Found', message: 'Chat not found', statusCode: 404 }, 404)
	}

	return c.body(null, 204)
})

export { chatRoutes }
