import { configure } from '../config.js'
import { signToken, verifyToken } from '../jwt.js'
import type { UserRepository } from '../types.js'

const SECRET = 'a-test-secret-key-that-is-at-least-32-characters-long'

const mockRepo: UserRepository = {
	insertUser: vi.fn(),
	getCredentialsByEmail: vi.fn(),
	getUserById: vi.fn(),
}

beforeAll(() => {
	configure({ userRepository: mockRepo, secretKey: SECRET })
})

describe('signToken', () => {
	it('returns a JWT string', async () => {
		const token = await signToken('user-123', 'access')

		expect(typeof token).toBe('string')
		expect(token.split('.')).toHaveLength(3)
	})

	it('produces different tokens for access vs refresh', async () => {
		const access = await signToken('user-123', 'access')
		const refresh = await signToken('user-123', 'refresh')

		expect(access).not.toBe(refresh)
	})

	it('generates unique jti for each token', async () => {
		const token1 = await signToken('user-123', 'access')
		const token2 = await signToken('user-123', 'access')

		const payload1 = await verifyToken(token1)
		const payload2 = await verifyToken(token2)

		expect(payload1.jti).not.toBe(payload2.jti)
	})
})

describe('verifyToken', () => {
	it('decodes a valid access token', async () => {
		const token = await signToken('user-123', 'access')

		const payload = await verifyToken(token)

		expect(payload.sub).toBe('user-123')
		expect(payload.type).toBe('access')
		expect(payload.iss).toBe('heimdall')
		expect(payload.jti).toBeTypeOf('string')
		expect(payload.iat).toBeTypeOf('number')
		expect(payload.exp).toBeTypeOf('number')
	})

	it('access token has ~30m expiry', async () => {
		const token = await signToken('user-123', 'access')

		const payload = await verifyToken(token)

		const ttl = (payload.exp as number) - (payload.iat as number)

		expect(ttl).toBe(30 * 60)
	})

	it('refresh token has ~7d expiry', async () => {
		const token = await signToken('user-123', 'refresh')

		const payload = await verifyToken(token)

		const ttl = (payload.exp as number) - (payload.iat as number)

		expect(ttl).toBe(7 * 24 * 60 * 60)
	})

	it('throws on tampered token', async () => {
		const token = await signToken('user-123', 'access')

		const tampered = `${token.slice(0, -5)}XXXXX`

		await expect(verifyToken(tampered)).rejects.toThrow()
	})

	it('throws on garbage input', async () => {
		await expect(verifyToken('not.a.jwt')).rejects.toThrow()
	})

	it('rejects a token signed with a different key', async () => {
		const { sign } = await import('hono/jwt')

		const badToken = await sign(
			{ sub: 'user-123', iss: 'heimdall', type: 'access' },
			'wrong-key-that-is-at-least-32-characters-long',
			'HS256',
		)

		await expect(verifyToken(badToken)).rejects.toThrow()
	})

	it('rejects a token with wrong issuer', async () => {
		const { sign } = await import('hono/jwt')

		const badToken = await sign(
			{ sub: 'user-123', iss: 'not-heimdall', type: 'access' },
			SECRET,
			'HS256',
		)

		await expect(verifyToken(badToken)).rejects.toThrow('Invalid token issuer')
	})
})
