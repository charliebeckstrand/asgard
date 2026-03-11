import {
	CircuitBreakerStateSchema,
	ConnectionStatusSchema,
	HealthStatusSchema,
	LogLevelSchema,
	NodeEnvSchema,
	ServiceReachabilitySchema,
} from '../index.js'

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

describe('ServiceReachabilitySchema', () => {
	it.each(['healthy', 'degraded', 'unreachable'])('accepts "%s"', (value) => {
		const result = ServiceReachabilitySchema.safeParse(value)

		expect(result.success).toBe(true)
	})

	it('rejects invalid values', () => {
		const result = ServiceReachabilitySchema.safeParse('unhealthy')

		expect(result.success).toBe(false)
	})
})

describe('CircuitBreakerStateSchema', () => {
	it.each(['closed', 'open', 'half-open'])('accepts "%s"', (value) => {
		const result = CircuitBreakerStateSchema.safeParse(value)

		expect(result.success).toBe(true)
	})

	it('rejects invalid values', () => {
		const result = CircuitBreakerStateSchema.safeParse('tripped')

		expect(result.success).toBe(false)
	})
})

describe('LogLevelSchema', () => {
	it.each(['debug', 'info', 'warn', 'error', 'fatal'])('accepts "%s"', (value) => {
		const result = LogLevelSchema.safeParse(value)

		expect(result.success).toBe(true)
	})

	it('rejects invalid values', () => {
		const result = LogLevelSchema.safeParse('trace')

		expect(result.success).toBe(false)
	})
})

describe('NodeEnvSchema', () => {
	it.each(['development', 'production', 'test'])('accepts "%s"', (value) => {
		const result = NodeEnvSchema.safeParse(value)

		expect(result.success).toBe(true)
	})

	it('defaults to development', () => {
		const result = NodeEnvSchema.parse(undefined)

		expect(result).toBe('development')
	})
})

describe('ConnectionStatusSchema', () => {
	it.each(['up', 'down', 'unknown'])('accepts "%s"', (value) => {
		const result = ConnectionStatusSchema.safeParse(value)

		expect(result.success).toBe(true)
	})
})
