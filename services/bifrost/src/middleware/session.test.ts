import { describe, expect, it } from 'vitest'
import { _decodeSession, _encodeSession, type SessionData } from './session.js'

const SECRET = 'test-secret-that-is-at-least-32-chars-long'

const testSession: SessionData = {
	accessToken: 'at_abc123',
	refreshToken: 'rt_xyz789',
	expiresAt: Math.floor(Date.now() / 1000) + 3600,
}

describe('Session encoding/decoding', () => {
	it('round-trips session data', async () => {
		const encoded = await _encodeSession(testSession, SECRET)
		const decoded = await _decodeSession(encoded, SECRET)

		expect(decoded).toEqual(testSession)
	})

	it('returns null for tampered cookie', async () => {
		const encoded = await _encodeSession(testSession, SECRET)

		// Tamper with the encoded value
		const tampered = `${encoded.slice(0, -4)}XXXX`
		const decoded = await _decodeSession(tampered, SECRET)

		expect(decoded).toBeNull()
	})

	it('returns null for wrong secret', async () => {
		const encoded = await _encodeSession(testSession, SECRET)
		const decoded = await _decodeSession(encoded, 'wrong-secret-that-is-also-32-chars!!')

		expect(decoded).toBeNull()
	})

	it('returns null for garbage input', async () => {
		const decoded = await _decodeSession('not-a-valid-cookie', SECRET)

		expect(decoded).toBeNull()
	})

	it('returns null for empty string', async () => {
		const decoded = await _decodeSession('', SECRET)

		expect(decoded).toBeNull()
	})
})
