import { verify } from 'hono/jwt'
import {
	extractCookie,
	signTestAccessToken,
	signTestRefreshToken,
	TEST_TOKEN_ISSUER,
} from '../auth.js'

const SECRET = 'test-secret-that-is-at-least-32-chars-long'

describe('signTestAccessToken', () => {
	it('produces an HS256 token verifiable with the same secret', async () => {
		const token = await signTestAccessToken(SECRET)

		const payload = await verify(token, SECRET, 'HS256')

		expect(payload.iss).toBe(TEST_TOKEN_ISSUER)

		expect(payload.type).toBe('access')

		expect(payload.sub).toBe('user-test')
	})

	it('honours sub override', async () => {
		const token = await signTestAccessToken(SECRET, { sub: 'admin-1' })

		const payload = await verify(token, SECRET, 'HS256')

		expect(payload.sub).toBe('admin-1')
	})

	it('fails verification with a different secret', async () => {
		const token = await signTestAccessToken(SECRET)

		await expect(verify(token, 'different-secret-also-32-chars-long!', 'HS256')).rejects.toThrow()
	})

	it('respects exp override', async () => {
		const past = Math.floor(Date.now() / 1000) - 1000

		const token = await signTestAccessToken(SECRET, { exp: past })

		await expect(verify(token, SECRET, 'HS256')).rejects.toThrow()
	})
})

describe('signTestRefreshToken', () => {
	it('produces a refresh-typed token', async () => {
		const token = await signTestRefreshToken(SECRET, { sub: 'u1' })

		const payload = await verify(token, SECRET, 'HS256')

		expect(payload.type).toBe('refresh')
	})
})

describe('extractCookie', () => {
	it('extracts a named cookie value', () => {
		const res = new Response(null, {
			headers: { 'Set-Cookie': 'foo=bar123; Path=/; HttpOnly' },
		})

		expect(extractCookie(res, 'foo')).toBe('bar123')
	})

	it('returns undefined when the cookie is absent', () => {
		const res = new Response(null, {
			headers: { 'Set-Cookie': 'other=value' },
		})

		expect(extractCookie(res, 'foo')).toBeUndefined()
	})

	it('returns undefined when there is no Set-Cookie header', () => {
		expect(extractCookie(new Response(), 'foo')).toBeUndefined()
	})

	it('escapes regex metacharacters in the cookie name', () => {
		const res = new Response(null, {
			headers: { 'Set-Cookie': 'a.b=safe; Path=/' },
		})

		expect(extractCookie(res, 'a.b')).toBe('safe')

		expect(extractCookie(res, 'aXb')).toBeUndefined()
	})
})
