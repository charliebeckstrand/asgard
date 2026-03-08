import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'

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
	it('GET /frigg/environment/:namespace returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/frigg/environment/test.dev')

		expect(res.status).toBe(401)
	})

	it('PUT /frigg/environment/:namespace returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/frigg/environment/test.dev', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ KEY: 'value' }),
		})

		expect(res.status).toBe(401)
	})

	it('GET /frigg/environment/:namespace/history returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/frigg/environment/test.dev/history')

		expect(res.status).toBe(401)
	})

	it('POST /frigg/environment/:namespace/:key/rollback returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/frigg/environment/test.dev/SECRET_KEY/rollback', {
			method: 'POST',
		})

		expect(res.status).toBe(401)
	})

	it('DELETE /frigg/environment/:namespace returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/frigg/environment/test.dev', {
			method: 'DELETE',
		})

		expect(res.status).toBe(401)
	})

	it('DELETE /frigg/environment/:namespace/:key returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/frigg/environment/test.dev/SECRET_KEY', {
			method: 'DELETE',
		})

		expect(res.status).toBe(401)
	})
})
