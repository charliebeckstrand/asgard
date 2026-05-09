const SECRET_KEY = 'test-secret-key-that-is-at-least-32-chars-long'

vi.stubEnv('DATABASE_URL', 'postgres://test:test@localhost:5432/test')
vi.stubEnv('SECRET_KEY', SECRET_KEY)
vi.stubEnv('CORS_ORIGIN', 'http://localhost:3000')

const { mockChatRepo } = vi.hoisted(() => ({
	mockChatRepo: {
		getChats: vi.fn(),
		getChatById: vi.fn(),
		insertChat: vi.fn(),
		insertMessage: vi.fn(),
		deleteChat: vi.fn(),
	},
}))

vi.mock('../lib/chat-repository.js', () => ({
	createChatRepository: () => mockChatRepo,
}))

vi.mock('../lib/db.js', () => ({
	db: { ping: vi.fn().mockResolvedValue(true) },
	closePool: vi.fn(),
}))

import { sign } from 'hono/jwt'
import { createBragiApp } from '../app.js'

type ErrorResponse = { error: string; message: string; statusCode: number }

type OpenAPISpec = {
	openapi: string
	info: { title: string }
	paths: Record<string, unknown>
	components?: { securitySchemes?: Record<string, { type: string; scheme: string }> }
}

async function makeAccessToken(overrides: Record<string, unknown> = {}): Promise<string> {
	const now = Math.floor(Date.now() / 1000)

	return sign(
		{
			sub: 'user-123',
			iss: 'heimdall',
			type: 'access',
			iat: now,
			exp: now + 3600,
			...overrides,
		},
		SECRET_KEY,
		'HS256',
	)
}

const app = createBragiApp()

beforeEach(() => {
	vi.clearAllMocks()
})

describe('service metadata', () => {
	it('GET /bragi returns service metadata', async () => {
		const res = await app.request('/bragi')

		expect(res.status).toBe(200)

		const body = (await res.json()) as { service: string; openApi: string; docs: string }

		expect(body.service).toBe('bragi')
		expect(body.openApi).toBe('/bragi/openapi.json')
		expect(body.docs).toBe('/bragi/docs')
	})

	it('GET /bragi/health returns healthy when DB ping succeeds', async () => {
		const res = await app.request('/bragi/health')

		expect(res.status).toBe(200)

		const body = (await res.json()) as {
			status: string
			services: { database: { status: string } }
		}

		expect(body.status).toBe('healthy')
		expect(body.services.database.status).toBe('up')
	})
})

describe('OpenAPI', () => {
	it('exposes Bearer security scheme', async () => {
		const res = await app.request('/bragi/openapi.json')

		expect(res.status).toBe(200)

		const spec = (await res.json()) as OpenAPISpec

		expect(spec.info.title).toBe('Bragi')
		expect(spec.components?.securitySchemes?.Bearer).toEqual({
			type: 'http',
			scheme: 'bearer',
			bearerFormat: 'JWT',
		})
	})
})

describe('chat routes', () => {
	it('rejects requests without a Bearer token', async () => {
		const res = await app.request('/bragi/chat')

		expect(res.status).toBe(401)
	})

	it('rejects requests with a token signed by a different key', async () => {
		const token = await sign(
			{ sub: 'user-123', iss: 'heimdall', type: 'access' },
			'a-different-secret-also-32-chars-long',
			'HS256',
		)

		const res = await app.request('/bragi/chat', {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(res.status).toBe(401)
	})

	it('rejects refresh tokens', async () => {
		const token = await makeAccessToken({ type: 'refresh' })

		const res = await app.request('/bragi/chat', {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(res.status).toBe(401)
	})

	it('lists chats for the authenticated user', async () => {
		mockChatRepo.getChats.mockResolvedValueOnce([
			{
				id: '00000000-0000-4000-8000-000000000001',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
			},
		])

		const token = await makeAccessToken()

		const res = await app.request('/bragi/chat', {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(res.status).toBe(200)
		expect(mockChatRepo.getChats).toHaveBeenCalledWith('user-123')
	})

	it('returns 404 when fetching a chat the user does not own', async () => {
		mockChatRepo.getChatById.mockResolvedValueOnce(null)

		const token = await makeAccessToken()

		const res = await app.request('/bragi/chat/00000000-0000-4000-8000-000000000001', {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(res.status).toBe(404)

		const body = (await res.json()) as ErrorResponse

		expect(body.error).toBe('Not Found')
		expect(body.message).toBe('Chat not found')
	})

	it('returns 404 when deleting a missing chat', async () => {
		mockChatRepo.deleteChat.mockResolvedValueOnce(false)

		const token = await makeAccessToken()

		const res = await app.request('/bragi/chat/00000000-0000-4000-8000-000000000001', {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(res.status).toBe(404)
	})

	it('returns 204 when deleting an owned chat', async () => {
		mockChatRepo.deleteChat.mockResolvedValueOnce(true)

		const token = await makeAccessToken()

		const res = await app.request('/bragi/chat/00000000-0000-4000-8000-000000000001', {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(res.status).toBe(204)
		expect(mockChatRepo.deleteChat).toHaveBeenCalledWith(
			'00000000-0000-4000-8000-000000000001',
			'user-123',
		)
	})
})

describe('error handling', () => {
	it('returns 404 for unknown routes', async () => {
		const res = await app.request('/bragi/unknown')

		expect(res.status).toBe(404)

		const body = (await res.json()) as ErrorResponse

		expect(body.error).toBe('Not Found')
	})
})
