import { stubServiceEnv, TEST_DATABASE_URL, TEST_SECRET_KEY, TEST_SESSION_SECRET } from '../env.js'

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('stubServiceEnv', () => {
	it('sets the standard service env vars to defaults', () => {
		stubServiceEnv()

		expect(process.env.SECRET_KEY).toBe(TEST_SECRET_KEY)
		expect(process.env.SESSION_SECRET).toBe(TEST_SESSION_SECRET)
		expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL)
		expect(process.env.CORS_ORIGIN).toBe('http://localhost:3000')
	})

	it('honours per-key overrides', () => {
		stubServiceEnv({ CORS_ORIGIN: 'http://localhost:4444' })

		expect(process.env.CORS_ORIGIN).toBe('http://localhost:4444')
		expect(process.env.SECRET_KEY).toBe(TEST_SECRET_KEY)
	})

	it('skips a key when override is null', () => {
		const before = process.env.DATABASE_URL

		stubServiceEnv({ DATABASE_URL: null })

		expect(process.env.DATABASE_URL).toBe(before)
		expect(process.env.SECRET_KEY).toBe(TEST_SECRET_KEY)
	})

	it('passes through extra keys not in the standard set', () => {
		stubServiceEnv({ CUSTOM_SERVICE: 'custom-value' })

		expect(process.env.CUSTOM_SERVICE).toBe('custom-value')
	})
})
