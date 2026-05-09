import { sql } from 'saga'
import type { Chat, ChatMessage, ChatRepository } from '../chat/types.js'
import { db } from './db.js'

export function createChatRepository(): ChatRepository {
	return {
		async getChats(userId) {
			return db.many<Chat>(
				sql`SELECT id, user_id, created_at, updated_at FROM brg_chats WHERE user_id = ${userId} ORDER BY updated_at DESC`,
			)
		},

		async getChatById(id, userId) {
			const chat = await db.first<Chat>(
				sql`SELECT id, user_id, created_at, updated_at FROM brg_chats WHERE id = ${id} AND user_id = ${userId}`,
			)

			if (!chat) return null

			const messages = await db.many<ChatMessage>(
				sql`SELECT id, chat_id, role, type, content, created_at FROM brg_chat_messages WHERE chat_id = ${id} ORDER BY created_at`,
			)

			return { ...chat, messages }
		},

		async insertChat(id, userId) {
			return db.one<Chat>(
				sql`INSERT INTO brg_chats (id, user_id) VALUES (${id}, ${userId}) RETURNING id, user_id, created_at, updated_at`,
			)
		},

		async insertMessage(id, chatId, role, type, content) {
			return db.tx<ChatMessage>(async (tx) => {
				const row = await tx.one<ChatMessage>(
					sql`INSERT INTO brg_chat_messages (id, chat_id, role, type, content)
						VALUES (${id}, ${chatId}, ${role}, ${type}, ${content})
						RETURNING id, chat_id, role, type, content, created_at`,
				)

				await tx.exec(sql`UPDATE brg_chats SET updated_at = now() WHERE id = ${chatId}`)

				return row
			})
		},

		async deleteChat(id, userId) {
			const count = await db.exec(
				sql`DELETE FROM brg_chats WHERE id = ${id} AND user_id = ${userId}`,
			)

			return count > 0
		},
	}
}
