import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { clearCache } from '../lib/environments.js'

beforeEach(() => {
	process.env.FRIGG_API_KEY = 'test-api-key'
})

afterEach(() => {
	clearCache()
	delete process.env.FRIGG_API_KEY
})

describe('health route', () => {
	it('GET /frigg/health returns healthy status', async () => {
		const app = createApp()
		const res = await app.request('/frigg/health')

		expect(res.status).toBe(200)

		const body = await res.json()

		expect(body.status).toBe('ok')
		expect(body.service).toBe('frigg')
	})
})

describe('environment routes', () => {
	it('GET /frigg/environment/:service returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/frigg/environment/heimdall')

		expect(res.status).toBe(401)
	})

	it('GET /frigg/environment/:service returns config with valid API key', async () => {
		const app = createApp()
		const res = await app.request('/frigg/environment/heimdall', {
			headers: { 'X-API-Key': 'test-api-key' },
		})

		expect(res.status).toBe(200)

		const body = await res.json()

		expect(body.service).toBe('heimdall')
		expect(body.data).toBeDefined()
		expect(body.data.PORT).toBe('8000')
	})

	it('GET /frigg/environment/:service returns 404 for unknown service', async () => {
		const app = createApp()
		const res = await app.request('/frigg/environment/unknown', {
			headers: { 'X-API-Key': 'test-api-key' },
		})

		expect(res.status).toBe(404)
	})

	it('GET /frigg/environment lists all services', async () => {
		const app = createApp()
		const res = await app.request('/frigg/environment', {
			headers: { 'X-API-Key': 'test-api-key' },
		})

		expect(res.status).toBe(200)

		const body = await res.json()

		expect(body.services).toContain('heimdall')
		expect(body.services).toContain('bifrost')
		expect(body.services).toContain('frigg')
	})
})

describe('validate routes', () => {
	it('GET /frigg/validate returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/frigg/validate')

		expect(res.status).toBe(401)
	})

	it('GET /frigg/validate returns validation results', async () => {
		const app = createApp()
		const res = await app.request('/frigg/validate', {
			headers: { 'X-API-Key': 'test-api-key' },
		})

		expect(res.status).toBe(200)

		const body = await res.json()

		expect(body.status).toBeDefined()
		expect(body.services).toBeInstanceOf(Array)
		expect(body.services.length).toBeGreaterThan(0)

		for (const svc of body.services) {
			expect(svc.service).toBeDefined()
			expect(['pass', 'warn', 'fail']).toContain(svc.status)
			expect(svc.issues).toBeInstanceOf(Array)
		}
	})

	it('GET /frigg/validate/:service validates a single service', async () => {
		const app = createApp()
		const res = await app.request('/frigg/validate/heimdall', {
			headers: { 'X-API-Key': 'test-api-key' },
		})

		expect(res.status).toBe(200)

		const body = await res.json()

		expect(body.service).toBe('heimdall')
		expect(['pass', 'warn', 'fail']).toContain(body.status)
	})

	it('GET /frigg/validate/:service returns 404 for unknown service', async () => {
		const app = createApp()
		const res = await app.request('/frigg/validate/unknown', {
			headers: { 'X-API-Key': 'test-api-key' },
		})

		expect(res.status).toBe(404)
	})
})
