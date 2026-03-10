vi.stubEnv('DATABASE_URL', 'postgres://test:test@localhost:5432/test')

import { createHuginnApp } from '../app.js'

type HealthResponse = {
	status: string
	version: string
	uptime: number
}

type ErrorResponse = {
	error: string
	message: string
	statusCode: number
}

const app = createHuginnApp()

describe('Health route', () => {
	it('GET /events/health returns healthy status', async () => {
		const res = await app.request('/events/health')

		expect(res.status).toBe(200)

		const body = (await res.json()) as HealthResponse

		expect(body.status).toBe('healthy')
		expect(body.version).toBe('0.1.0')
		expect(body.uptime).toBeTypeOf('number')
	})
})

describe('OpenAPI', () => {
	it('GET /events/openapi.json returns the spec', async () => {
		const res = await app.request('/events/openapi.json')

		expect(res.status).toBe(200)

		const spec = (await res.json()) as { openapi: string; info: { title: string } }

		expect(spec.openapi).toBe('3.0.0')
		expect(spec.info.title).toBe('Huginn')
	})

	it('GET /events/docs returns Swagger UI HTML', async () => {
		const res = await app.request('/events/docs')

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

describe('Auth middleware', () => {
	it('returns 401 for publish without API key', async () => {
		const res = await app.request('/events/publish', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ topic: 'test', payload: {}, source: 'test' }),
		})

		expect(res.status).toBe(401)
	})

	it('returns 401 for subscriptions without API key', async () => {
		const res = await app.request('/events/subscriptions')

		expect(res.status).toBe(401)
	})
})
