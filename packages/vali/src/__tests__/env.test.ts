import { stubServiceEnv, TEST_APP_ORIGINS, TEST_DATABASE_URL } from '../env.js'

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('stubServiceEnv', () => {
	it('sets the standard service env vars to defaults', () => {
		stubServiceEnv()

		expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL)

		expect(process.env.APP_ORIGINS).toBe('http://localhost:3000')
	})

	it('honours per-key overrides', () => {
		stubServiceEnv({ APP_ORIGINS: 'http://localhost:4444' })

		expect(process.env.APP_ORIGINS).toBe('http://localhost:4444')

		expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL)
	})

	it('skips a key when override is null', () => {
		const before = process.env.DATABASE_URL

		stubServiceEnv({ DATABASE_URL: null })

		expect(process.env.DATABASE_URL).toBe(before)

		expect(process.env.APP_ORIGINS).toBe(TEST_APP_ORIGINS)
	})

	it('passes through extra keys not in the standard set', () => {
		stubServiceEnv({ CUSTOM_SERVICE: 'custom-value' })

		expect(process.env.CUSTOM_SERVICE).toBe('custom-value')
	})
})
