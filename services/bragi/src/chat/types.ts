import { z } from '@hono/zod-openapi'
import { IdSchema, TimestampSchema } from 'skuld'

export const ChatMessageRoleSchema = z.enum(['user', 'agent'])
export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>

export const ChatMessageTypeSchema = z.enum(['text'])
export type ChatMessageType = z.infer<typeof ChatMessageTypeSchema>

export const ChatMessageSchema = z
	.object({
		id: IdSchema,
		chat_id: IdSchema,
		role: ChatMessageRoleSchema,
		type: ChatMessageTypeSchema,
		content: z.string(),
		created_at: TimestampSchema,
	})
	.openapi('ChatMessage')

export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ChatSchema = z.object({
	id: IdSchema,
	user_id: IdSchema,
	created_at: TimestampSchema,
	updated_at: TimestampSchema,
})

export type Chat = z.infer<typeof ChatSchema>

export interface ChatDetail extends Chat {
	messages: ChatMessage[]
}

export interface ChatRepository {
	getChats(userId: string): Promise<Chat[]>
	getChatById(id: string, userId: string): Promise<ChatDetail | null>
	insertChat(id: string, userId: string): Promise<Chat>
	insertMessage(
		id: string,
		chatId: string,
		role: ChatMessageRole,
		type: ChatMessageType,
		content: string,
	): Promise<ChatMessage>
	deleteChat(id: string, userId: string): Promise<boolean>
}
