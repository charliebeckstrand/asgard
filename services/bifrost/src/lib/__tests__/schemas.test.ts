import { LoginPasswordSchema, normalizeEmail, PasswordSchema } from '../schemas.js'

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
