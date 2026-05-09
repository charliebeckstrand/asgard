import {
	EmailSchema,
	IdSchema,
	IpAddressSchema,
	LoginPasswordSchema,
	PasswordSchema,
	TimestampSchema,
} from '../index.js'

describe('IdSchema', () => {
	it('accepts valid UUIDs', () => {
		const result = IdSchema.safeParse('550e8400-e29b-41d4-a716-446655440000')

		expect(result.success).toBe(true)
	})

	it('rejects non-UUIDs', () => {
		const result = IdSchema.safeParse('not-a-uuid')

		expect(result.success).toBe(false)
	})
})

describe('IpAddressSchema', () => {
	it('accepts IPv4 addresses', () => {
		const result = IpAddressSchema.safeParse('192.168.1.100')

		expect(result.success).toBe(true)
	})

	it('accepts IPv6 addresses', () => {
		const result = IpAddressSchema.safeParse('::1')

		expect(result.success).toBe(true)
	})

	it('rejects empty strings', () => {
		const result = IpAddressSchema.safeParse('')

		expect(result.success).toBe(false)
	})

	it('rejects malformed IP addresses', () => {
		expect(IpAddressSchema.safeParse('not-an-ip').success).toBe(false)

		expect(IpAddressSchema.safeParse('999.999.999.999').success).toBe(false)

		expect(IpAddressSchema.safeParse('192.168.1').success).toBe(false)
	})
})

describe('EmailSchema', () => {
	it('accepts valid emails', () => {
		const result = EmailSchema.safeParse('user@example.com')

		expect(result.success).toBe(true)
	})

	it('rejects invalid emails', () => {
		const result = EmailSchema.safeParse('not-an-email')

		expect(result.success).toBe(false)
	})
})

describe('PasswordSchema', () => {
	it('accepts passwords with 8+ characters', () => {
		const result = PasswordSchema.safeParse('securepass')

		expect(result.success).toBe(true)
	})

	it('rejects short passwords', () => {
		const result = PasswordSchema.safeParse('short')

		expect(result.success).toBe(false)
	})
})

describe('LoginPasswordSchema', () => {
	it('accepts any non-empty string', () => {
		const result = LoginPasswordSchema.safeParse('x')

		expect(result.success).toBe(true)
	})

	it('rejects empty strings', () => {
		const result = LoginPasswordSchema.safeParse('')

		expect(result.success).toBe(false)
	})
})

describe('TimestampSchema', () => {
	it('accepts ISO 8601 datetime strings', () => {
		const result = TimestampSchema.safeParse('2026-01-01T00:00:00.000Z')

		expect(result.success).toBe(true)
	})

	it('rejects non-datetime strings', () => {
		const result = TimestampSchema.safeParse('yesterday')

		expect(result.success).toBe(false)
	})
})
