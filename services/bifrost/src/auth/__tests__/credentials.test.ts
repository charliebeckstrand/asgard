import { hash } from '@node-rs/argon2'
import type { User } from 'skuld'
import { configure, getConfig } from '../config.js'
import {
	AuthError,
	authenticateUser,
	checkTurnstile,
	FAILED_LOGIN_WAIT_SECONDS,
	MAX_FAILED_LOGINS,
	registerUser,
} from '../credentials.js'
import type {
	ActivityRepository,
	CredentialsRow,
	EmailTokenRepository,
	MfaRepository,
	OAuthRepository,
	PasskeyRepository,
	SessionRepository,
	UserRepository,
} from '../types.js'

const TEST_USER: User = {
	id: 'user-123',
	email: 'alice@example.com',
	is_active: true,
	is_verified: true,
	roles: ['user'],
	created_at: '2024-01-01T00:00:00Z',
	updated_at: '2024-01-01T00:00:00Z',
}

let hashedPassword: string

let mockRepo: UserRepository

let mockSessionRepo: SessionRepository

beforeAll(async () => {
	hashedPassword = await hash('correct-password', { algorithm: 2 })
})

beforeEach(() => {
	mockRepo = {
		insertUser: vi.fn().mockResolvedValue(TEST_USER),
		getCredentialsByEmail: vi.fn().mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: true,
			is_verified: true,
		} satisfies CredentialsRow),
		getUsers: vi.fn().mockResolvedValue([]),
		getUserById: vi.fn().mockResolvedValue(TEST_USER),
		setUserActive: vi.fn().mockResolvedValue(TEST_USER),
		countFailedLogin: vi.fn().mockResolvedValue(true),
		clearFailedLogins: vi.fn(),
		deleteStaleFailedLogins: vi.fn(),
	}

	mockSessionRepo = {
		createSession: vi.fn(),
		findSession: vi.fn(),
		deleteSession: vi.fn(),
		deleteUserSessions: vi.fn(),
		deleteExpiredSessions: vi.fn(),
		passSecondStep: vi.fn(),
		failSecondStep: vi.fn(),
	}

	configure({
		userRepository: mockRepo,
		sessionRepository: mockSessionRepo,
		passkeyRepository: {} as PasskeyRepository,
		passkeys: { domain: 'localhost', origins: ['http://localhost:3000'] },
		mfaRepository: {} as MfaRepository,
		mfa: { issuer: 'localhost' },
		oauthRepository: {} as OAuthRepository,
		emailTokenRepository: {} as EmailTokenRepository,
		activityRepository: {} as ActivityRepository,
		sendEmail: vi.fn(),
		oauth: {},
	})
})

describe('AuthError', () => {
	it('has correct name and code properties', () => {
		const err = new AuthError('invalid_credentials', 'bad password')

		expect(err.name).toBe('AuthError')
		expect(err.code).toBe('invalid_credentials')
		expect(err.message).toBe('bad password')
		expect(err).toBeInstanceOf(Error)
	})
})

describe('authenticateUser', () => {
	it("returns the user's id for valid credentials", async () => {
		expect(await authenticateUser('alice@example.com', 'correct-password')).toBe(TEST_USER.id)
	})

	it('normalizes email to lowercase and trimmed', async () => {
		await authenticateUser('  Alice@Example.COM  ', 'correct-password')

		expect(mockRepo.getCredentialsByEmail).toHaveBeenCalledWith('alice@example.com')
	})

	it('throws invalid_credentials for wrong password', async () => {
		await expect(authenticateUser('alice@example.com', 'wrong-password')).rejects.toThrow(AuthError)

		try {
			await authenticateUser('alice@example.com', 'wrong-password')
		} catch (err) {
			expect((err as AuthError).code).toBe('invalid_credentials')
		}
	})

	it('throws invalid_credentials for unknown email', async () => {
		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue(null)

		await expect(authenticateUser('nobody@example.com', 'any-password')).rejects.toThrow(AuthError)
	})

	it('refuses a password for an account made with GitHub or Google', async () => {
		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: null,
			is_active: true,
			is_verified: true,
		})

		await expect(authenticateUser('alice@example.com', 'dummy-timing-pad')).rejects.toMatchObject({
			code: 'invalid_credentials',
		})
	})

	it('throws account_inactive for inactive user', async () => {
		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: false,
			is_verified: true,
		})

		try {
			await authenticateUser('alice@example.com', 'correct-password')

			expect.unreachable('should have thrown')
		} catch (err) {
			expect((err as AuthError).code).toBe('account_inactive')
		}
	})

	it('accepts a correct password for an admin', async () => {
		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: true,
			is_verified: true,
		})

		await expect(authenticateUser('alice@example.com', 'correct-password')).resolves.toBe(
			TEST_USER.id,
		)
	})

	it('reports invalid_credentials for an admin with a wrong password', async () => {
		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: true,
			is_verified: true,
		})

		const err = await authenticateUser('alice@example.com', 'wrong-password').catch((e) => e)

		expect((err as AuthError).code).toBe('invalid_credentials')
	})

	it('calls onSecurityEvent on failed login', async () => {
		const onSecurityEvent = vi.fn()

		configure({
			userRepository: mockRepo,
			sessionRepository: mockSessionRepo,
			passkeyRepository: {} as PasskeyRepository,
			passkeys: { domain: 'localhost', origins: ['http://localhost:3000'] },
			mfaRepository: {} as MfaRepository,
			mfa: { issuer: 'localhost' },
			oauthRepository: {} as OAuthRepository,
			emailTokenRepository: {} as EmailTokenRepository,
			activityRepository: {} as ActivityRepository,
			sendEmail: vi.fn(),
			oauth: {},
			onSecurityEvent,
		})

		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue(null)

		await authenticateUser('alice@example.com', 'wrong', '1.2.3.4').catch(() => {})

		expect(onSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'login_failed', ip: '1.2.3.4' }),
		)
	})
})

describe('failed login limit', () => {
	it('counts each try against the normalized email', async () => {
		await authenticateUser('  Alice@Example.COM  ', 'wrong-password').catch(() => {})

		expect(mockRepo.countFailedLogin).toHaveBeenCalledWith(
			'alice@example.com',
			MAX_FAILED_LOGINS,
			FAILED_LOGIN_WAIT_SECONDS,
		)
	})

	it('refuses a try that must wait without checking the password', async () => {
		vi.mocked(mockRepo.countFailedLogin).mockResolvedValue(false)

		await expect(authenticateUser('alice@example.com', 'correct-password')).rejects.toMatchObject({
			code: 'too_many_logins',
			status: 429,
		})

		expect(mockRepo.getCredentialsByEmail).not.toHaveBeenCalled()
	})

	it('limits an unknown email the same way', async () => {
		vi.mocked(mockRepo.countFailedLogin).mockResolvedValue(false)

		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue(null)

		await expect(authenticateUser('nobody@example.com', 'any-password')).rejects.toMatchObject({
			code: 'too_many_logins',
		})
	})

	it('clears the count when the password is right', async () => {
		await authenticateUser('alice@example.com', 'correct-password')

		expect(mockRepo.clearFailedLogins).toHaveBeenCalledWith('alice@example.com')
	})

	it('clears the count for an inactive account with the right password', async () => {
		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: false,
			is_verified: true,
		})

		await authenticateUser('alice@example.com', 'correct-password').catch(() => {})

		expect(mockRepo.clearFailedLogins).toHaveBeenCalledWith('alice@example.com')
	})

	it('keeps the count when the password is wrong', async () => {
		await authenticateUser('alice@example.com', 'wrong-password').catch(() => {})

		expect(mockRepo.clearFailedLogins).not.toHaveBeenCalled()
	})
})

describe('checkTurnstile', () => {
	it('lets a sign-up through when Turnstile is off', async () => {
		await expect(checkTurnstile(undefined)).resolves.toBeUndefined()
	})

	it('passes a token that Cloudflare accepts', async () => {
		const verify = vi.fn().mockResolvedValue(true)

		configure({ ...getConfig(), turnstile: { siteKey: 'key', verify } })

		await checkTurnstile('token', '203.0.113.1')

		expect(verify).toHaveBeenCalledWith('token', '203.0.113.1')
	})

	it.each([
		['a missing token', undefined, true],
		['a token that Cloudflare refuses', 'token', false],
	])('refuses %s', async (_, token, accepted) => {
		configure({
			...getConfig(),
			turnstile: { siteKey: 'key', verify: vi.fn().mockResolvedValue(accepted) },
		})

		await expect(checkTurnstile(token)).rejects.toMatchObject({
			code: 'turnstile_failed',
			status: 400,
		})
	})
})

describe('registerUser', () => {
	it('returns user row on success', async () => {
		const user = await registerUser('new@example.com', 'password123')

		expect(user?.id).toBe(TEST_USER.id)

		expect(user?.email).toBe(TEST_USER.email)
	})

	it('normalizes email before inserting', async () => {
		await registerUser('  Bob@EXAMPLE.COM  ', 'password123')

		expect(mockRepo.insertUser).toHaveBeenCalledWith('bob@example.com', expect.any(String))
	})

	it('hashes the password with Argon2id', async () => {
		await registerUser('bob@example.com', 'password123')

		const hashed = vi.mocked(mockRepo.insertUser).mock.calls[0][1] as string

		expect(hashed).toContain('$argon2')
	})

	it('refuses a password known from a data breach before making the account', async () => {
		configure({ ...getConfig(), isBreachedPassword: vi.fn().mockResolvedValue(true) })

		await expect(registerUser('bob@example.com', 'password123')).rejects.toMatchObject({
			code: 'password_breached',
		})

		expect(mockRepo.insertUser).not.toHaveBeenCalled()
	})

	it('returns null when the email already has an account', async () => {
		vi.mocked(mockRepo.insertUser).mockRejectedValue({ code: '23505' })

		expect(await registerUser('alice@example.com', 'password123')).toBeNull()
	})

	it('re-throws non-duplicate errors', async () => {
		vi.mocked(mockRepo.insertUser).mockRejectedValue(new Error('connection refused'))

		await expect(registerUser('bob@example.com', 'password123')).rejects.toThrow(
			'connection refused',
		)
	})

	it('calls onSecurityEvent on registration', async () => {
		const onSecurityEvent = vi.fn()

		configure({
			userRepository: mockRepo,
			sessionRepository: mockSessionRepo,
			passkeyRepository: {} as PasskeyRepository,
			passkeys: { domain: 'localhost', origins: ['http://localhost:3000'] },
			mfaRepository: {} as MfaRepository,
			mfa: { issuer: 'localhost' },
			oauthRepository: {} as OAuthRepository,
			emailTokenRepository: {} as EmailTokenRepository,
			activityRepository: {} as ActivityRepository,
			sendEmail: vi.fn(),
			oauth: {},
			onSecurityEvent,
		})

		await registerUser('new@example.com', 'password123', '1.2.3.4')

		expect(onSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'registration', ip: '1.2.3.4' }),
		)
	})
})
