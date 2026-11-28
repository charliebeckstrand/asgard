import { CheckIpResponseSchema, IngestEventSchema } from '../index.js'

const event = { ip: '192.168.1.1', event_type: 'login_failed', service: 'bifrost' }

describe('IngestEventSchema', () => {
	it('defaults details to an empty object', () => {
		const result = IngestEventSchema.parse(event)

		expect(result.details).toEqual({})
	})

	it.each(['login\nfailed', 'Login Failed', 'a'.repeat(101), ''])(
		'rejects event_type %j',
		(eventType) => {
			const result = IngestEventSchema.safeParse({ ...event, event_type: eventType })

			expect(result.success).toBe(false)
		},
	)
})

describe('CheckIpResponseSchema', () => {
	it('rejects an expiry that is not an ISO 8601 time', () => {
		const result = CheckIpResponseSchema.safeParse({ banned: true, expires_at: 'tomorrow' })

		expect(result.success).toBe(false)
	})
})
