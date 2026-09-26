import {
	base32Encode,
	decryptSecret,
	encryptSecret,
	matchTotp,
	TOTP_STEP_SECONDS,
	totpCode,
	totpUri,
} from '../totp.js'

// The SHA-1 secret of the RFC 6238 test vectors.
const secret = Buffer.from('12345678901234567890')

const stepAt = (seconds: number) => Math.floor(seconds / TOTP_STEP_SECONDS)

describe('totpCode', () => {
	it.each([
		[59, '287082'],
		[1111111109, '081804'],
		[1234567890, '005924'],
		[2000000000, '279037'],
	])('matches the RFC 6238 vector at %i seconds', (seconds, code) => {
		expect(totpCode(secret, stepAt(seconds))).toBe(code)
	})
})

describe('matchTotp', () => {
	const now = 1111111109 * 1000

	it('returns the step of the current code', () => {
		expect(matchTotp(secret, '081804', now)).toBe(stepAt(1111111109))
	})

	it('accepts the code of the step before and after', () => {
		const step = stepAt(1111111109)

		expect(matchTotp(secret, totpCode(secret, step - 1), now)).toBe(step - 1)

		expect(matchTotp(secret, totpCode(secret, step + 1), now)).toBe(step + 1)
	})

	it('refuses a code two steps away', () => {
		expect(matchTotp(secret, totpCode(secret, stepAt(1111111109) - 2), now)).toBeNull()
	})

	it.each(['', '12345', '1234567', 'abcdef', ' 81804'])('refuses the malformed code %j', (code) => {
		expect(matchTotp(secret, code, now)).toBeNull()
	})
})

describe('base32Encode', () => {
	it.each([
		['', ''],
		['f', 'MY'],
		['fo', 'MZXQ'],
		['foobar', 'MZXW6YTBOI'],
	])('encodes %j without padding', (input, output) => {
		expect(base32Encode(Buffer.from(input))).toBe(output)
	})
})

describe('totpUri', () => {
	it('names the issuer and the account, and carries the secret', () => {
		const uri = new URL(totpUri(Buffer.from('foobar'), 'ivoryimage.dev', 'alice@example.com'))

		expect(uri.protocol).toBe('otpauth:')

		expect(uri.host).toBe('totp')

		expect(decodeURIComponent(uri.pathname)).toBe('/ivoryimage.dev:alice@example.com')

		expect(uri.searchParams.get('secret')).toBe('MZXW6YTBOI')

		expect(uri.searchParams.get('issuer')).toBe('ivoryimage.dev')

		expect(uri.searchParams.get('digits')).toBe('6')

		expect(uri.searchParams.get('period')).toBe('30')
	})
})

describe('encryptSecret', () => {
	const key = 'k'.repeat(32)

	it('round-trips through decryptSecret', () => {
		expect(decryptSecret(encryptSecret(secret, key), key)).toEqual(secret)
	})

	it('never stores the secret in the clear', () => {
		expect(encryptSecret(secret, key).includes(secret)).toBe(false)
	})

	it('refuses to decrypt with another key', () => {
		expect(() => decryptSecret(encryptSecret(secret, key), 'x'.repeat(32))).toThrow()
	})
})
