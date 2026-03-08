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

describe('config routes', () => {
	it('GET /frigg/config/:namespace returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/frigg/config/test.dev')

		expect(res.status).toBe(401)
	})

	it('PUT /frigg/config/:namespace returns 401 without API key', async () => {
		const app = createApp()
		const res = await app.request('/frigg/config/test.dev', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ KEY: 'value' }),
		})

		expect(res.status).toBe(401)
	})
})
