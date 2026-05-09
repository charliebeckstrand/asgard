export interface ChatRow {
	id: string
	user_id: string
	created_at: string
	updated_at: string
}

export interface ChatMessageRow {
	id: string
	chat_id: string
	role: 'user' | 'agent'
	type: string
	content: string
	created_at: string
}

export interface ChatDetail extends ChatRow {
	messages: ChatMessageRow[]
}

export interface ChatRepository {
	getChats(userId: string): Promise<ChatRow[]>
	getChatById(id: string, userId: string): Promise<ChatDetail | null>
	insertChat(id: string, userId: string): Promise<ChatRow>
	insertMessage(
		id: string,
		chatId: string,
		role: ChatMessageRow['role'],
		type: string,
		content: string,
	): Promise<ChatMessageRow>
	deleteChat(id: string, userId: string): Promise<boolean>
}
