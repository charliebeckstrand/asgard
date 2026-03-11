vi.stubEnv('DATABASE_URL', 'postgres://test:test@localhost:5432/test')
vi.stubEnv('SECRET_KEY', 'test-secret-key-that-is-at-least-32-chars')

vi.mock('heimdall', () => ({
	configure: vi.fn(),
	refreshTokenPair: vi.fn(),
}))

vi.mock('vidar/client', () => ({
	configure: vi.fn(),
	createVidar: vi.fn().mockReturnValue(async (_c: unknown, next: () => Promise<void>) => {
		await next()
	}),
	reportEvent: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
	getPool: vi.fn().mockReturnValue({
		query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
	}),
}))

import { testClient } from 'hono/testing'
import { createBifrostApp } from '../app.js'

type OpenAPISpec = {
	openapi: string
	info: { title: string }
	paths: Record<string, unknown>
}

type ServiceInfoResponse = {
	service: string
	openApi: string
	docs: string
}

type ErrorResponse = {
	error: string
	message: string
	statusCode: number
}

const app = createBifrostApp()
const client = testClient(app)

describe('Health route', () => {
	it('GET /api returns service metadata', async () => {
		const res = await app.request('/api')

		expect(res.status).toBe(200)

		const body = (await res.json()) as ServiceInfoResponse

		expect(body.service).toBe('bifrost')
		expect(body.openApi).toBe('/api/openapi.json')
		expect(body.docs).toBe('/api/docs')
	})

	it('GET /api/health returns healthy status', async () => {
		const res = await client.api.health.$get()

		expect(res.status).toBe(200)

		const body = await res.json()

		expect(body.status).toBe('healthy')
		expect(body.version).toBe('0.1.0')

		expect(body.uptime).toBeTypeOf('number')
	})
})

describe('OpenAPI', () => {
	it('GET /api/openapi.json returns the spec', async () => {
		const res = await app.request('/api/openapi.json')

		expect(res.status).toBe(200)

		const spec = (await res.json()) as OpenAPISpec

		expect(spec.openapi).toBe('3.0.0')
		expect(spec.info.title).toBe('Bifrost')

		expect(spec.paths['/api/health']).toBeDefined()
	})

	it('GET /api/docs returns Swagger UI HTML', async () => {
		const res = await app.request('/api/docs')

		expect(res.status).toBe(200)

		const text = await res.text()

		expect(text).toContain('swagger-ui')
	})
})

describe('Error handling', () => {
	it('returns 404 for unknown routes', async () => {
		const res = await app.request('/unknown')

		expect(res.status).toBe(404)

		const body = (await res.json()) as ErrorResponse

		expect(body.error).toBe('Not Found')
		expect(body.statusCode).toBe(404)
	})
})
