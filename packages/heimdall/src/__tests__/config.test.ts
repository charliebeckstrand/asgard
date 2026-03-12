import type { UserRepository } from '../types.js'

const mockRepo: UserRepository = {
	insertUser: vi.fn(),
	getCredentialsByEmail: vi.fn(),
	getUserById: vi.fn(),
}

describe('heimdall config', () => {
	beforeEach(() => {
		vi.resetModules()
	})

	it('getConfig throws before configure is called', async () => {
		const { getConfig } = await import('../config.js')

		expect(() => getConfig()).toThrow('Heimdall not configured. Call configure() first.')
	})

	it('configure succeeds with valid secretKey', async () => {
		const { configure, getConfig } = await import('../config.js')

		configure({
			userRepository: mockRepo,
			secretKey: 'a'.repeat(32),
		})

		const config = getConfig()

		expect(config.secretKey).toBe('a'.repeat(32))
		expect(config.userRepository).toBe(mockRepo)
	})

	it('configure throws if secretKey is too short', async () => {
		const { configure } = await import('../config.js')

		expect(() =>
			configure({
				userRepository: mockRepo,
				secretKey: 'short',
			}),
		).toThrow('Heimdall secretKey must be at least 32 characters')
	})

	it('configure accepts optional fields', async () => {
		const { configure, getConfig } = await import('../config.js')

		const onEvent = vi.fn()

		configure({
			userRepository: mockRepo,
			secretKey: 'a'.repeat(32),
			apiKey: 'test-api-key',
			onSecurityEvent: onEvent,
		})

		const config = getConfig()

		expect(config.apiKey).toBe('test-api-key')
		expect(config.onSecurityEvent).toBe(onEvent)
	})
})
