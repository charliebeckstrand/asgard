import type {
	MfaRepository,
	OAuthRepository,
	PasskeyRepository,
	SessionRepository,
	UserRepository,
} from '../types.js'

const userRepository = {} as UserRepository

const sessionRepository = {} as SessionRepository

const passkeyRepository = {} as PasskeyRepository

const mfaRepository = {} as MfaRepository

const passkeys = { domain: 'localhost', origins: ['http://localhost:3000'] }

const mfa = { key: 'k'.repeat(32), issuer: 'localhost' }

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

		configure({
			userRepository,
			sessionRepository,
			passkeyRepository,
			mfaRepository,
			passkeys,
			mfa,
			oauthRepository: {} as OAuthRepository,
			oauth: {},
			onSecurityEvent,
		})

		const config = getConfig()

		expect(config.userRepository).toBe(userRepository)

		expect(config.sessionRepository).toBe(sessionRepository)

		expect(config.passkeyRepository).toBe(passkeyRepository)

		expect(config.mfaRepository).toBe(mfaRepository)

		expect(config.passkeys).toEqual(passkeys)

		expect(config.mfa).toEqual(mfa)

		expect(config.onSecurityEvent).toBe(onSecurityEvent)
	})
})
