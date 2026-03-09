import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { clearCache } from '../lib/environments.js'
import { clearManifestCache } from '../lib/manifests.js'

beforeEach(() => {
	process.env.NODE_ENV = 'development'
	process.env.FRIGG_API_KEY = 'test-api-key'
})

afterEach(() => {
	clearCache()
	clearManifestCache()
	delete process.env.NODE_ENV
	delete process.env.FRIGG_API_KEY
})

describe('health route', () => {
	it('GET /services/health returns healthy status', async () => {
		const app = createApp()
		const res = await app.request('/services/health')

		expect(res.status).toBe(200)

		const body = await res.json()

		expect(body.status).toBe('ok')
		expect(body.service).toBe('frigg')
	})
})

describe('validate routes', () => {
	it('GET /services/validate returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/services/validate')

		expect(res.status).toBe(401)
	})

	it('GET /services/validate returns validation results', async () => {
		const app = createApp()
		const res = await app.request('/services/validate', {
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

	it('GET /services/validate/:service validates a single service', async () => {
		const app = createApp()
		const res = await app.request('/services/validate/heimdall', {
			headers: { 'X-API-Key': 'test-api-key' },
		})

		expect(res.status).toBe(200)

		const body = await res.json()

		expect(body.service).toBe('heimdall')
		expect(['pass', 'warn', 'fail']).toContain(body.status)
	})

	it('GET /services/validate/:service returns 404 for unknown service', async () => {
		const app = createApp()
		const res = await app.request('/services/validate/unknown', {
			headers: { 'X-API-Key': 'test-api-key' },
		})

		expect(res.status).toBe(404)
	})
})

describe('secrets routes', () => {
	it('GET /services/secrets/status returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/services/secrets/status')

		expect(res.status).toBe(401)
	})

	it('GET /services/secrets/status returns secrets metadata', async () => {
		const app = createApp()
		const res = await app.request('/services/secrets/status', {
			headers: { 'X-API-Key': 'test-api-key' },
		})

		expect(res.status).toBe(200)

		const body = await res.json()

		expect(['healthy', 'unhealthy']).toContain(body.status)
		expect(body.secrets).toBeInstanceOf(Array)

		for (const secret of body.secrets) {
			expect(secret.key).toBeDefined()
			expect(secret.owner).toBeDefined()
			expect(secret.consumers).toBeInstanceOf(Array)
			expect(typeof secret.consistent).toBe('boolean')
			expect(typeof secret.generated).toBe('boolean')
		}
	})
})
