import {
	CallbackUrlSchema,
	DetailsSchema,
	EmailSchema,
	EventTypeSchema,
	IdSchema,
	IpAddressSchema,
	LoginPasswordSchema,
	MetadataSchema,
	PasswordSchema,
	PayloadSchema,
	ServiceNameSchema,
	StringIdSchema,
	TimestampSchema,
	TopicFilterSchema,
	TopicSchema,
	UrlSchema,
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

describe('StringIdSchema', () => {
	it('accepts non-empty strings', () => {
		const result = StringIdSchema.safeParse('abc-123')

		expect(result.success).toBe(true)
	})

	it('rejects empty strings', () => {
		const result = StringIdSchema.safeParse('')

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
})

describe('UrlSchema', () => {
	it('accepts valid URLs', () => {
		const result = UrlSchema.safeParse('https://example.com')

		expect(result.success).toBe(true)
	})

	it('rejects invalid URLs', () => {
		const result = UrlSchema.safeParse('not-a-url')

		expect(result.success).toBe(false)
	})
})

describe('CallbackUrlSchema', () => {
	it('accepts valid callback URLs', () => {
		const result = CallbackUrlSchema.safeParse('http://localhost:3000/api/webhooks/test')

		expect(result.success).toBe(true)
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

describe('ServiceNameSchema', () => {
	it('accepts valid service names', () => {
		const result = ServiceNameSchema.safeParse('bifrost')

		expect(result.success).toBe(true)
	})

	it('rejects empty strings', () => {
		const result = ServiceNameSchema.safeParse('')

		expect(result.success).toBe(false)
	})

	it('rejects strings over 100 characters', () => {
		const result = ServiceNameSchema.safeParse('a'.repeat(101))

		expect(result.success).toBe(false)
	})
})

describe('TopicSchema', () => {
	it('accepts valid topics', () => {
		const result = TopicSchema.safeParse('user.registered')

		expect(result.success).toBe(true)
	})

	it('rejects empty strings', () => {
		const result = TopicSchema.safeParse('')

		expect(result.success).toBe(false)
	})

	it('rejects strings over 255 characters', () => {
		const result = TopicSchema.safeParse('a'.repeat(256))

		expect(result.success).toBe(false)
	})
})

describe('TopicFilterSchema', () => {
	it('accepts a topic string', () => {
		const result = TopicFilterSchema.safeParse('user.registered')

		expect(result.success).toBe(true)
	})

	it('accepts undefined', () => {
		const result = TopicFilterSchema.safeParse(undefined)

		expect(result.success).toBe(true)
	})
})

describe('EventTypeSchema', () => {
	it('accepts valid event types', () => {
		const result = EventTypeSchema.safeParse('login_failed')

		expect(result.success).toBe(true)
	})

	it('rejects empty strings', () => {
		const result = EventTypeSchema.safeParse('')

		expect(result.success).toBe(false)
	})
})

describe('PayloadSchema', () => {
	it('accepts record objects', () => {
		const result = PayloadSchema.safeParse({ key: 'value' })

		expect(result.success).toBe(true)
	})

	it('defaults to empty object', () => {
		const result = PayloadSchema.parse(undefined)

		expect(result).toEqual({})
	})
})

describe('DetailsSchema', () => {
	it('defaults to empty object', () => {
		const result = DetailsSchema.parse(undefined)

		expect(result).toEqual({})
	})
})

describe('MetadataSchema', () => {
	it('accepts metadata objects', () => {
		const result = MetadataSchema.safeParse({ request_id: '123', user_agent: 'curl' })

		expect(result.success).toBe(true)
	})

	it('defaults to empty object', () => {
		const result = MetadataSchema.parse(undefined)

		expect(result).toEqual({})
	})
})
