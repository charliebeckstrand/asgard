import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { createDatabaseClient, type Db } from 'saga'
import {
	applyMigrations,
	isDockerAvailable,
	startPostgres,
	type TestDatabase,
} from 'vali/containers'
import { stubServiceEnv } from 'vali/env'
import type { ChatRepository } from '../../chat/types.js'

stubServiceEnv()

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

let testDb: TestDatabase
let pool: Pool
let db: Db
let repo: ChatRepository

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startPostgres()

	pool = new Pool({ connectionString: testDb.connectionUri })

	await applyMigrations(pool, migrationsDir)

	db = createDatabaseClient(pool)

	vi.doMock('../db.js', () => ({
		db,
		closePool: vi.fn().mockResolvedValue(undefined),
		migrate: vi.fn().mockResolvedValue(undefined),
	}))

	const mod = await import('../chat-repository.js')

	repo = mod.createChatRepository()
}, 60_000)

afterAll(async () => {
	await pool?.end()

	await testDb?.stop()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await pool.query('TRUNCATE brg_chats CASCADE')
})

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

const USER_A = '00000000-0000-4000-8000-000000000001'
const USER_B = '00000000-0000-4000-8000-000000000002'

describeWithDocker('createChatRepository (integration)', () => {
	describe('insertChat + getChats', () => {
		it('returns the user’s chats only', async () => {
			const chatA1 = randomUUID()
			const chatA2 = randomUUID()
			const chatB1 = randomUUID()

			await repo.insertChat(chatA1, USER_A)
			await repo.insertChat(chatA2, USER_A)
			await repo.insertChat(chatB1, USER_B)

			const aChats = await repo.getChats(USER_A)

			expect(aChats.map((c) => c.id).sort()).toEqual([chatA1, chatA2].sort())

			const bChats = await repo.getChats(USER_B)

			expect(bChats.map((c) => c.id)).toEqual([chatB1])
		})

		it('orders by updated_at desc', async () => {
			const oldChat = randomUUID()
			const newChat = randomUUID()

			await repo.insertChat(oldChat, USER_A)

			await new Promise((r) => setTimeout(r, 10))

			await repo.insertChat(newChat, USER_A)

			const chats = await repo.getChats(USER_A)

			expect(chats[0].id).toBe(newChat)
			expect(chats[1].id).toBe(oldChat)
		})
	})

	describe('getChatById ownership scoping', () => {
		it('returns the chat with messages when owned', async () => {
			const chatId = randomUUID()

			await repo.insertChat(chatId, USER_A)
			await repo.insertMessage(randomUUID(), chatId, 'user', 'text', 'hello')
			await repo.insertMessage(randomUUID(), chatId, 'agent', 'text', 'hi back')

			const chat = await repo.getChatById(chatId, USER_A)

			expect(chat).not.toBeNull()
			expect(chat?.messages).toHaveLength(2)
			expect(chat?.messages[0].content).toBe('hello')
			expect(chat?.messages[1].content).toBe('hi back')
		})

		it('returns null when the chat belongs to a different user', async () => {
			const chatId = randomUUID()

			await repo.insertChat(chatId, USER_A)

			expect(await repo.getChatById(chatId, USER_B)).toBeNull()
		})

		it('returns null for a missing chat', async () => {
			expect(await repo.getChatById(randomUUID(), USER_A)).toBeNull()
		})
	})

	describe('insertMessage', () => {
		it('persists the message and bumps the chat updated_at', async () => {
			const chatId = randomUUID()

			const chat = await repo.insertChat(chatId, USER_A)

			await new Promise((r) => setTimeout(r, 20))

			await repo.insertMessage(randomUUID(), chatId, 'user', 'text', 'ping')

			const refreshed = await repo.getChatById(chatId, USER_A)

			expect(new Date(refreshed?.updated_at as string).getTime()).toBeGreaterThan(
				new Date(chat.updated_at).getTime(),
			)

			expect(refreshed?.messages).toHaveLength(1)
		})

		it('returns the inserted row', async () => {
			const chatId = randomUUID()
			const messageId = randomUUID()

			await repo.insertChat(chatId, USER_A)

			const msg = await repo.insertMessage(messageId, chatId, 'user', 'text', 'body')

			expect(msg).toMatchObject({
				id: messageId,
				chat_id: chatId,
				role: 'user',
				type: 'text',
				content: 'body',
			})
		})
	})

	describe('deleteChat ownership scoping', () => {
		it('deletes only the user’s own chat', async () => {
			const chatId = randomUUID()

			await repo.insertChat(chatId, USER_A)

			expect(await repo.deleteChat(chatId, USER_B)).toBe(false)
			expect(await repo.getChatById(chatId, USER_A)).not.toBeNull()

			expect(await repo.deleteChat(chatId, USER_A)).toBe(true)
			expect(await repo.getChatById(chatId, USER_A)).toBeNull()
		})

		it('cascades to messages', async () => {
			const chatId = randomUUID()
			const messageId = randomUUID()

			await repo.insertChat(chatId, USER_A)
			await repo.insertMessage(messageId, chatId, 'user', 'text', 'orphan-me')

			await repo.deleteChat(chatId, USER_A)

			const orphans = await pool.query('SELECT 1 FROM brg_chat_messages WHERE id = $1', [messageId])

			expect(orphans.rowCount).toBe(0)
		})

		it('returns false for a missing chat', async () => {
			expect(await repo.deleteChat(randomUUID(), USER_A)).toBe(false)
		})
	})
})
