import { HttpError } from 'grid'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { type AuthEnv, requireAuth } from '../auth.js'

const SECRET_KEY = 'test-secret-that-is-at-least-32-chars-long'

beforeAll(() => {
	vi.stubEnv('DATABASE_URL', 'postgres://test:test@localhost:5432/test')
	vi.stubEnv('SECRET_KEY', SECRET_KEY)
})

afterAll(() => {
	vi.unstubAllEnvs()
})

function makeApp() {
	const app = new Hono<AuthEnv>()

	app.use('*', requireAuth())

	app.get('/', (c) => c.json({ userId: c.get('userId') }))

	app.onError((err, c) => {
		if (err instanceof HttpError) {
			return c.json({ error: err.name, message: err.message }, err.status)
		}

		return c.json({ error: 'Internal', message: err.message }, 500)
	})

	return app
}

function nowSec() {
	return Math.floor(Date.now() / 1000)
}

const baseClaims = () => ({
	sub: 'user-123',
	iss: 'heimdall',
	type: 'access',
	exp: nowSec() + 3600,
	iat: nowSec(),
})

describe('requireAuth', () => {
	it('returns 401 when Authorization header is missing', async () => {
		const res = await makeApp().request('/')

		expect(res.status).toBe(401)
	})

	it('returns 401 when scheme is not Bearer', async () => {
		const res = await makeApp().request('/', {
			headers: { Authorization: 'Basic abc' },
		})

		expect(res.status).toBe(401)
	})

	it('returns 401 when signature is invalid', async () => {
		const token = await sign(baseClaims(), 'a-different-secret-also-32-chars-long', 'HS256')

		const res = await makeApp().request('/', {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(res.status).toBe(401)
	})

	it('returns 401 when issuer is not heimdall', async () => {
		const token = await sign({ ...baseClaims(), iss: 'someone-else' }, SECRET_KEY, 'HS256')

		const res = await makeApp().request('/', {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(res.status).toBe(401)
	})

	it('returns 401 when token type is not access', async () => {
		const token = await sign({ ...baseClaims(), type: 'refresh' }, SECRET_KEY, 'HS256')

		const res = await makeApp().request('/', {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(res.status).toBe(401)
	})

	it('returns 401 when sub claim is missing', async () => {
		const { sub: _sub, ...claimsWithoutSub } = baseClaims()

		const token = await sign(claimsWithoutSub, SECRET_KEY, 'HS256')

		const res = await makeApp().request('/', {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(res.status).toBe(401)
	})

	it('passes through and exposes userId on a valid access token', async () => {
		const token = await sign(baseClaims(), SECRET_KEY, 'HS256')

		const res = await makeApp().request('/', {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ userId: 'user-123' })
	})
})
