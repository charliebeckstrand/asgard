import { IpAddressSchema, LoginPasswordSchema, normalizeEmail, PasswordSchema } from '../index.js'

describe('IpAddressSchema', () => {
	it.each(['192.168.1.100', '::1', '2001:db8::8a2e:370:7334'])('accepts %s', (ip) => {
		expect(IpAddressSchema.safeParse(ip).success).toBe(true)
	})

	it.each(['', 'not-an-ip', '999.999.999.999', '192.168.1'])('rejects %j', (ip) => {
		expect(IpAddressSchema.safeParse(ip).success).toBe(false)
	})
})

describe('PasswordSchema', () => {
	it.each([8, 128])('accepts %i characters', (length) => {
		expect(PasswordSchema.safeParse('a'.repeat(length)).success).toBe(true)
	})

	it.each([7, 129])('rejects %i characters', (length) => {
		expect(PasswordSchema.safeParse('a'.repeat(length)).success).toBe(false)
	})
})

describe('LoginPasswordSchema', () => {
	it('accepts a password shorter than PasswordSchema allows', () => {
		expect(LoginPasswordSchema.safeParse('x').success).toBe(true)
	})

	it.each([0, 129])('rejects %i characters', (length) => {
		expect(LoginPasswordSchema.safeParse('a'.repeat(length)).success).toBe(false)
	})
})

describe('normalizeEmail', () => {
	it('trims and lowercases', () => {
		expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com')
	})
})
