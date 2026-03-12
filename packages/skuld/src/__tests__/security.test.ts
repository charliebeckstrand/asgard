import {
	BanListSchema,
	BanSchema,
	CheckIpResponseSchema,
	CreateBanSchema,
	IngestEventSchema,
	SecurityEventSchema,
} from '../security.js'

describe('IngestEventSchema', () => {
	it('accepts valid event', () => {
		const result = IngestEventSchema.safeParse({
			ip: '192.168.1.1',
			event_type: 'login_failed',
			details: { email: 'test@example.com' },
			service: 'bifrost',
		})

		expect(result.success).toBe(true)
	})

	it('rejects missing ip', () => {
		const result = IngestEventSchema.safeParse({
			event_type: 'login_failed',
			details: {},
			service: 'bifrost',
		})

		expect(result.success).toBe(false)
	})

	it('rejects missing event_type', () => {
		const result = IngestEventSchema.safeParse({
			ip: '192.168.1.1',
			details: {},
			service: 'bifrost',
		})

		expect(result.success).toBe(false)
	})
})

describe('SecurityEventSchema', () => {
	it('accepts valid security event', () => {
		const result = SecurityEventSchema.safeParse({
			id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
			ip: '10.0.0.1',
			event_type: 'login_failed',
			details: { email: 'test@example.com' },
			service: 'bifrost',
			created_at: '2024-01-01T00:00:00Z',
		})

		expect(result.success).toBe(true)
	})
})

describe('CheckIpResponseSchema', () => {
	it('accepts not-banned response', () => {
		const result = CheckIpResponseSchema.safeParse({ banned: false })

		expect(result.success).toBe(true)
	})

	it('accepts banned response with reason and expires_at', () => {
		const result = CheckIpResponseSchema.safeParse({
			banned: true,
			reason: 'Brute force',
			expires_at: '2024-12-31T23:59:59Z',
		})

		expect(result.success).toBe(true)
	})
})

describe('CreateBanSchema', () => {
	it('accepts valid ban with duration', () => {
		const result = CreateBanSchema.safeParse({
			ip: '192.168.1.100',
			reason: 'Manual ban',
			duration_minutes: 60,
		})

		expect(result.success).toBe(true)
	})

	it('accepts ban without duration (permanent)', () => {
		const result = CreateBanSchema.safeParse({
			ip: '10.0.0.1',
			reason: 'Permanent ban',
		})

		expect(result.success).toBe(true)
	})

	it('rejects empty reason', () => {
		const result = CreateBanSchema.safeParse({
			ip: '192.168.1.1',
			reason: '',
		})

		expect(result.success).toBe(false)
	})
})

describe('BanSchema', () => {
	it('accepts full ban object with nullable fields', () => {
		const result = BanSchema.safeParse({
			id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
			ip: '192.168.1.1',
			reason: 'Brute force',
			rule_id: 'brute_force',
			created_by: 'vidar',
			expires_at: '2024-12-31T23:59:59Z',
			created_at: '2024-01-01T00:00:00Z',
		})

		expect(result.success).toBe(true)
	})

	it('accepts null rule_id and expires_at', () => {
		const result = BanSchema.safeParse({
			id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
			ip: '192.168.1.1',
			reason: 'Manual',
			rule_id: null,
			created_by: 'admin',
			expires_at: null,
			created_at: '2024-01-01T00:00:00Z',
		})

		expect(result.success).toBe(true)
	})
})

describe('BanListSchema', () => {
	it('accepts list with data and total', () => {
		const result = BanListSchema.safeParse({
			data: [
				{
					id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
					ip: '192.168.1.1',
					reason: 'Test',
					rule_id: null,
					created_by: 'system',
					expires_at: null,
					created_at: '2024-01-01T00:00:00Z',
				},
			],
			total: 1,
		})

		expect(result.success).toBe(true)
	})

	it('accepts empty list', () => {
		const result = BanListSchema.safeParse({
			data: [],
			total: 0,
		})

		expect(result.success).toBe(true)
	})
})
