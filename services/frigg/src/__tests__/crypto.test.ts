import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decrypt, encrypt, timingSafeCompare } from '../lib/crypto.js'

const TEST_KEY = randomBytes(32).toString('hex')

describe('crypto', () => {
	it('encrypts and decrypts a value', () => {
		const plaintext = 'postgres://user:pass@localhost:5432/db'

		const sealed = encrypt(plaintext, TEST_KEY)
		const result = decrypt(sealed, TEST_KEY)

		expect(result).toBe(plaintext)
	})

	it('produces different ciphertext each time (random IV)', () => {
		const plaintext = 'same-value'

		const a = encrypt(plaintext, TEST_KEY)
		const b = encrypt(plaintext, TEST_KEY)

		expect(a).not.toBe(b)
		expect(decrypt(a, TEST_KEY)).toBe(plaintext)
		expect(decrypt(b, TEST_KEY)).toBe(plaintext)
	})

	it('handles empty strings', () => {
		const sealed = encrypt('', TEST_KEY)
		const result = decrypt(sealed, TEST_KEY)

		expect(result).toBe('')
	})

	it('handles unicode', () => {
		const plaintext = 'secret-with-emoji-🔐-and-日本語'

		const sealed = encrypt(plaintext, TEST_KEY)
		const result = decrypt(sealed, TEST_KEY)

		expect(result).toBe(plaintext)
	})

	it('fails to decrypt with wrong key', () => {
		const sealed = encrypt('secret', TEST_KEY)
		const wrongKey = randomBytes(32).toString('hex')

		expect(() => decrypt(sealed, wrongKey)).toThrow()
	})

	it('fails on tampered ciphertext', () => {
		const sealed = encrypt('secret', TEST_KEY)
		const tampered = `${sealed.slice(0, -2)}AA`

		expect(() => decrypt(tampered, TEST_KEY)).toThrow()
	})

	it('fails on invalid format', () => {
		expect(() => decrypt('not-valid', TEST_KEY)).toThrow('Invalid sealed value format')
	})
})

describe('timingSafeCompare', () => {
	it('returns true for matching strings', () => {
		expect(timingSafeCompare('abc', 'abc')).toBe(true)
	})

	it('returns false for different strings', () => {
		expect(timingSafeCompare('abc', 'def')).toBe(false)
	})

	it('returns false for different lengths', () => {
		expect(timingSafeCompare('abc', 'abcd')).toBe(false)
	})
})
