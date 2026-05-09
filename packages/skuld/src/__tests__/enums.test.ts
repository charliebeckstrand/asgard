import { ConnectionStatusSchema, HealthStatusSchema } from '../index.js'

describe('HealthStatusSchema', () => {
	it.each(['healthy', 'degraded', 'unhealthy'])('accepts "%s"', (value) => {
		const result = HealthStatusSchema.safeParse(value)

		expect(result.success).toBe(true)
	})

	it('rejects invalid values', () => {
		const result = HealthStatusSchema.safeParse('broken')

		expect(result.success).toBe(false)
	})
})

describe('ConnectionStatusSchema', () => {
	it.each(['up', 'down', 'unknown'])('accepts "%s"', (value) => {
		const result = ConnectionStatusSchema.safeParse(value)

		expect(result.success).toBe(true)
	})
})
