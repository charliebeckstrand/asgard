import { Hono } from 'hono'
import { createBearerAuth, timingSafeCompare } from '../api-key.js'

describe('timingSafeCompare', () => {
	it('returns true for matching strings', () => {
		expect(timingSafeCompare('secret-token', 'secret-token')).toBe(true)
	})

	it('returns false for different strings of same length', () => {
		expect(timingSafeCompare('secret-token', 'wrong!-token')).toBe(false)
	})

	it('returns false for different lengths', () => {
		expect(timingSafeCompare('short', 'much-longer-string')).toBe(false)
	})
})

describe('createBearerAuth', () => {
	const TOKEN = 'my-secret-api-key'

	function buildApp(getToken: () => string | undefined) {
		const app = new Hono()

		app.use('*', createBearerAuth(getToken))

		app.get('/protected', (c) => c.json({ ok: true }))

		return app
	}

	it('returns 401 without Authorization header', async () => {
		const app = buildApp(() => TOKEN)

		const res = await app.request('/protected')

		expect(res.status).toBe(401)
	})

	it('returns 401 with wrong token', async () => {
		const app = buildApp(() => TOKEN)

		const res = await app.request('/protected', {
			headers: { Authorization: 'Bearer wrong-token' },
		})

		expect(res.status).toBe(401)
	})

	it('allows request with correct token', async () => {
		const app = buildApp(() => TOKEN)

		const res = await app.request('/protected', {
			headers: { Authorization: `Bearer ${TOKEN}` },
		})

		expect(res.status).toBe(200)

		const body = (await res.json()) as { ok: boolean }

		expect(body.ok).toBe(true)
	})

	it('returns 401 when getToken returns undefined', async () => {
		const app = buildApp(() => undefined)

		const res = await app.request('/protected', {
			headers: { Authorization: `Bearer ${TOKEN}` },
		})

		expect(res.status).toBe(401)
	})
})
