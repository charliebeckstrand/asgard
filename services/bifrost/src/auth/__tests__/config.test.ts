import type { SessionRepository, UserRepository } from '../types.js'

const userRepository = {} as UserRepository

const sessionRepository = {} as SessionRepository

describe('auth config', () => {
	beforeEach(() => {
		vi.resetModules()
	})

	it('getConfig throws before configure is called', async () => {
		const { getConfig } = await import('../config.js')

		expect(() => getConfig()).toThrow('Auth not configured. Call configure() first.')
	})

	it('returns what configure stored', async () => {
		const { configure, getConfig } = await import('../config.js')

		const onSecurityEvent = vi.fn()

		configure({ userRepository, sessionRepository, onSecurityEvent })

		const config = getConfig()

		expect(config.userRepository).toBe(userRepository)

		expect(config.sessionRepository).toBe(sessionRepository)

		expect(config.onSecurityEvent).toBe(onSecurityEvent)
	})
})
