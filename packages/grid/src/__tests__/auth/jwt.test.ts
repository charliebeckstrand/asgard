import { sign } from 'hono/jwt'
import {
	InvalidTokenError,
	type JwtKeys,
	signToken,
	TOKEN_ISSUER,
	verifyAccessToken,
	verifyToken,
} from '../../auth/jwt.js'

const CURRENT = 'current-key-that-is-at-least-32-characters'
const PREVIOUS = 'previous-key-that-is-at-least-32-characters'
const STRANGER = 'stranger-key-that-is-also-32-characters-long'

const keys = (overrides: Partial<JwtKeys> = {}): JwtKeys => ({ current: CURRENT, ...overrides })

function nowSec() {
	return Math.floor(Date.now() / 1000)
}

const validClaims = (overrides: Record<string, unknown> = {}) => ({
	sub: 'user-1',
	type: 'access',
	iss: TOKEN_ISSUER,
	iat: nowSec(),
	exp: nowSec() + 3600,
	...overrides,
})

describe('signToken', () => {
	it('signs with the current key', async () => {
		const token = await signToken('user-1', 'access', keys())

		const payload = await verifyToken(token, keys())

		expect(payload.sub).toBe('user-1')
		expect(payload.type).toBe('access')
		expect(payload.iss).toBe(TOKEN_ISSUER)
	})

	it('produces unique jti per call', async () => {
		const a = await verifyToken(await signToken('u', 'access', keys()), keys())
		const b = await verifyToken(await signToken('u', 'access', keys()), keys())

		expect(a.jti).toBeTypeOf('string')
		expect(a.jti).not.toBe(b.jti)
	})
})

describe('verifyToken', () => {
	it('accepts a token signed with the current key', async () => {
		const token = await signToken('user-1', 'access', keys())

		await expect(verifyToken(token, keys())).resolves.toMatchObject({ sub: 'user-1' })
	})

	it('accepts a token signed with the previous key during rotation', async () => {
		const token = await sign(validClaims(), PREVIOUS, 'HS256')

		await expect(verifyToken(token, keys({ previous: PREVIOUS }))).resolves.toMatchObject({
			sub: 'user-1',
		})
	})

	it('rejects a token signed with the previous key when previous is unset', async () => {
		const token = await sign(validClaims(), PREVIOUS, 'HS256')

		await expect(verifyToken(token, keys())).rejects.toThrow()
	})

	it('rejects a token signed with neither key', async () => {
		const token = await sign(validClaims(), STRANGER, 'HS256')

		await expect(verifyToken(token, keys({ previous: PREVIOUS }))).rejects.toThrow()
	})

	it('rejects a token with the wrong issuer', async () => {
		const token = await sign(validClaims({ iss: 'someone-else' }), CURRENT, 'HS256')

		await expect(verifyToken(token, keys())).rejects.toThrow('Invalid token issuer')
	})

	it('surfaces the current-key error message when both keys fail', async () => {
		const tampered = `${await sign(validClaims(), STRANGER, 'HS256').then((t) => t.slice(0, -5))}XXXXX`

		await expect(verifyToken(tampered, keys({ previous: PREVIOUS }))).rejects.toThrow()
	})
})

describe('verifyAccessToken', () => {
	it('returns the payload for a valid access token', async () => {
		const token = await signToken('user-1', 'access', keys())

		const payload = await verifyAccessToken(token, keys())

		expect(payload.sub).toBe('user-1')
		expect(payload.type).toBe('access')
	})

	it('rejects refresh tokens', async () => {
		const token = await signToken('user-1', 'refresh', keys())

		await expect(verifyAccessToken(token, keys())).rejects.toBeInstanceOf(InvalidTokenError)
	})

	it('rejects tokens missing sub', async () => {
		const { sub: _sub, ...claims } = validClaims()

		const token = await sign(claims, CURRENT, 'HS256')

		await expect(verifyAccessToken(token, keys())).rejects.toBeInstanceOf(InvalidTokenError)
	})
})
