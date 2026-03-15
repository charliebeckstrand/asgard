import { sql } from 'saga'
import type { ChatMessageRow, ChatRepository, ChatRow, Tool } from '../chat/types.js'
import { db } from './db.js'

function decodeToolData(tool: Tool | null): Tool | null {
	if (!tool?.data) return tool

	return { type: tool.type, data: Buffer.from(tool.data, 'base64').toString('utf-8') }
}

export function createChatRepository(): ChatRepository {
	return {
		async getChats(userId) {
			return db.many<ChatRow>(
				sql`SELECT id, user_id, created_at, updated_at FROM chats WHERE user_id = ${userId} ORDER BY updated_at DESC`,
			)
		},

		async getChatById(id, userId) {
			const chat = await db.query<ChatRow>(
				sql`SELECT id, user_id, created_at, updated_at FROM chats WHERE id = ${id} AND user_id = ${userId}`,
			)

			if (!chat) return null

			const messages = await db.many<ChatMessageRow>(
				sql`SELECT id, chat_id, role, type, content, tool, created_at FROM chat_messages WHERE chat_id = ${id} ORDER BY created_at`,
			)

			return {
				...chat,
				messages: messages.map((m) => ({ ...m, tool: decodeToolData(m.tool) })),
			}
		},

		async insertChat(id, userId) {
			return db.get<ChatRow>(
				sql`INSERT INTO chats (id, user_id) VALUES (${id}, ${userId}) RETURNING id, user_id, created_at, updated_at`,
			)
		},

		async insertMessage(id, chatId, role, type, content, tool) {
			return db.tx<ChatMessageRow>(async (tx) => {
				const row = await tx.get<ChatMessageRow>(
					sql`INSERT INTO chat_messages (id, chat_id, role, type, content, tool)
						VALUES (${id}, ${chatId}, ${role}, ${type}, ${content}, ${tool ? sql`${JSON.stringify(tool)}::jsonb` : sql`NULL`})
						RETURNING id, chat_id, role, type, content, tool, created_at`,
				)

				await tx.exec(sql`UPDATE chats SET updated_at = now() WHERE id = ${chatId}`)

				return row
			})
		},

		async deleteChat(id, userId) {
			const count = await db.exec(sql`DELETE FROM chats WHERE id = ${id} AND user_id = ${userId}`)

			return count > 0
		},
	}
}
