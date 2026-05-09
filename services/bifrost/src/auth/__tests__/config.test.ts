import type { UserRepository } from '../types.js'

const mockRepo: UserRepository = {
	insertUser: vi.fn(),
	getCredentialsByEmail: vi.fn(),
	getUsers: vi.fn(),
	getUserById: vi.fn(),
	updateUser: vi.fn(),
	deleteUser: vi.fn(),
}

const KEY = 'a'.repeat(32)

describe('heimdall config', () => {
	beforeEach(() => {
		vi.resetModules()
	})

	it('getConfig throws before configure is called', async () => {
		const { getConfig } = await import('../config.js')

		expect(() => getConfig()).toThrow('Heimdall not configured. Call configure() first.')
	})

	it('configure succeeds with a valid current key', async () => {
		const { configure, getConfig } = await import('../config.js')

		configure({
			userRepository: mockRepo,
			keys: { current: KEY },
		})

		const config = getConfig()

		expect(config.keys.current).toBe(KEY)
		expect(config.keys.previous).toBeUndefined()
		expect(config.userRepository).toBe(mockRepo)
	})

	it('configure stores a previous key when provided', async () => {
		const { configure, getConfig } = await import('../config.js')

		const previous = 'b'.repeat(32)

		configure({
			userRepository: mockRepo,
			keys: { current: KEY, previous },
		})

		expect(getConfig().keys.previous).toBe(previous)
	})

	it('configure throws if the current key is too short', async () => {
		const { configure } = await import('../config.js')

		expect(() =>
			configure({
				userRepository: mockRepo,
				keys: { current: 'short' },
			}),
		).toThrow('Heimdall keys.current must be at least 32 characters')
	})

	it('configure throws if a provided previous key is too short', async () => {
		const { configure } = await import('../config.js')

		expect(() =>
			configure({
				userRepository: mockRepo,
				keys: { current: KEY, previous: 'short' },
			}),
		).toThrow('Heimdall keys.previous must be at least 32 characters when set')
	})

	it('configure accepts optional fields', async () => {
		const { configure, getConfig } = await import('../config.js')

		const onEvent = vi.fn()

		configure({
			userRepository: mockRepo,
			keys: { current: KEY },
			onSecurityEvent: onEvent,
		})

		expect(getConfig().onSecurityEvent).toBe(onEvent)
	})
})
