vi.mock('../../lib/repositories.js')

vi.mock('../../lib/turnstile.js')

vi.mock('../../lib/breached-passwords.js')

vi.mock('vidar/client')

import { hash } from '@node-rs/argon2'
import type { User } from 'skuld'
import { reportEvent } from 'vidar/client'
import { isBreachedPassword } from '../../lib/breached-passwords.js'
import { userRepository } from '../../lib/repositories.js'
import { turnstile } from '../../lib/turnstile.js'
import {
	authenticateUser,
	checkTurnstile,
	FAILED_LOGIN_WAIT_SECONDS,
	MAX_DAILY_SIGN_UPS,
	MAX_FAILED_LOGINS,
	registerUser,
} from '../credentials.js'
import { AuthError } from '../errors.js'

const IP = '203.0.113.1'

const TEST_USER: User = {
	id: 'user-123',
	email: 'alice@example.com',
	name: null,
	is_active: true,
	is_verified: true,
	roles: ['user'],
	created_at: '2024-01-01T00:00:00Z',
	updated_at: '2024-01-01T00:00:00Z',
}

const mockRepo = vi.mocked(userRepository)

let hashedPassword: string

beforeAll(async () => {
	hashedPassword = await hash('correct-password')
})

beforeEach(() => {
	vi.resetAllMocks()

	mockRepo.insertUser.mockResolvedValue(TEST_USER)

	mockRepo.getCredentialsByEmail.mockResolvedValue({
		id: TEST_USER.id,
		hashed_password: hashedPassword,
		is_active: true,
		is_verified: true,
	})

	mockRepo.countFailedLogin.mockResolvedValue(true)

	mockRepo.countSignUp.mockResolvedValue(true)

	vi.mocked(turnstile).mockReturnValue(null)

	vi.mocked(isBreachedPassword).mockResolvedValue(false)
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
		expect(await authenticateUser('alice@example.com', 'correct-password', IP)).toBe(TEST_USER.id)
	})

	it('normalizes email to lowercase and trimmed', async () => {
		await authenticateUser('  Alice@Example.COM  ', 'correct-password', IP)

		expect(mockRepo.getCredentialsByEmail).toHaveBeenCalledWith('alice@example.com')
	})

	it('throws invalid_credentials for wrong password', async () => {
		await expect(authenticateUser('alice@example.com', 'wrong-password', IP)).rejects.toThrow(
			AuthError,
		)

		try {
			await authenticateUser('alice@example.com', 'wrong-password', IP)
		} catch (err) {
			expect((err as AuthError).code).toBe('invalid_credentials')
		}
	})

	it('throws invalid_credentials for unknown email', async () => {
		mockRepo.getCredentialsByEmail.mockResolvedValue(null)

		await expect(authenticateUser('nobody@example.com', 'any-password', IP)).rejects.toThrow(
			AuthError,
		)
	})

	it('refuses a password for an account made with GitHub or Google', async () => {
		mockRepo.getCredentialsByEmail.mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: null,
			is_active: true,
			is_verified: true,
		})

		await expect(
			authenticateUser('alice@example.com', 'dummy-timing-pad', IP),
		).rejects.toMatchObject({
			code: 'invalid_credentials',
		})
	})

	it('throws account_inactive for inactive user', async () => {
		mockRepo.getCredentialsByEmail.mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: false,
			is_verified: true,
		})

		try {
			await authenticateUser('alice@example.com', 'correct-password', IP)

			expect.unreachable('should have thrown')
		} catch (err) {
			expect((err as AuthError).code).toBe('account_inactive')
		}
	})

	it('accepts a correct password for an admin', async () => {
		mockRepo.getCredentialsByEmail.mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: true,
			is_verified: true,
		})

		await expect(authenticateUser('alice@example.com', 'correct-password', IP)).resolves.toBe(
			TEST_USER.id,
		)
	})

	it('reports invalid_credentials for an admin with a wrong password', async () => {
		mockRepo.getCredentialsByEmail.mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: true,
			is_verified: true,
		})

		const err = await authenticateUser('alice@example.com', 'wrong-password', IP).catch((e) => e)

		expect((err as AuthError).code).toBe('invalid_credentials')
	})

	it('reports a failed login to Vidar', async () => {
		mockRepo.getCredentialsByEmail.mockResolvedValue(null)

		await authenticateUser('alice@example.com', 'wrong', '1.2.3.4').catch(() => {})

		expect(reportEvent).toHaveBeenCalledWith(
			'login_failed',
			'1.2.3.4',
			{ email: 'alice@example.com' },
			'bifrost',
		)
	})
})

describe('failed login limit', () => {
	it('counts each try against the normalized email', async () => {
		await authenticateUser('  Alice@Example.COM  ', 'wrong-password', IP).catch(() => {})

		expect(mockRepo.countFailedLogin).toHaveBeenCalledWith(
			'alice@example.com',
			MAX_FAILED_LOGINS,
			FAILED_LOGIN_WAIT_SECONDS,
		)
	})

	it('refuses a try that must wait without checking the password', async () => {
		mockRepo.countFailedLogin.mockResolvedValue(false)

		await expect(
			authenticateUser('alice@example.com', 'correct-password', IP),
		).rejects.toMatchObject({
			code: 'too_many_logins',
			status: 429,
		})

		expect(mockRepo.getCredentialsByEmail).not.toHaveBeenCalled()
	})

	it('limits an unknown email the same way', async () => {
		mockRepo.countFailedLogin.mockResolvedValue(false)

		mockRepo.getCredentialsByEmail.mockResolvedValue(null)

		await expect(authenticateUser('nobody@example.com', 'any-password', IP)).rejects.toMatchObject({
			code: 'too_many_logins',
		})
	})

	it('clears the count when the password is right', async () => {
		await authenticateUser('alice@example.com', 'correct-password', IP)

		expect(mockRepo.clearFailedLogins).toHaveBeenCalledWith('alice@example.com')
	})

	it('clears the count for an inactive account with the right password', async () => {
		mockRepo.getCredentialsByEmail.mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: false,
			is_verified: true,
		})

		await authenticateUser('alice@example.com', 'correct-password', IP).catch(() => {})

		expect(mockRepo.clearFailedLogins).toHaveBeenCalledWith('alice@example.com')
	})

	it('keeps the count when the password is wrong', async () => {
		await authenticateUser('alice@example.com', 'wrong-password', IP).catch(() => {})

		expect(mockRepo.clearFailedLogins).not.toHaveBeenCalled()
	})
})

describe('checkTurnstile', () => {
	it('lets a sign-up through when Turnstile is off', async () => {
		await expect(checkTurnstile(undefined)).resolves.toBeUndefined()
	})

	it('passes a token that Cloudflare accepts', async () => {
		const verify = vi.fn().mockResolvedValue(true)

		vi.mocked(turnstile).mockReturnValue({ siteKey: 'key', verify })

		await checkTurnstile('token', '203.0.113.1')

		expect(verify).toHaveBeenCalledWith('token', '203.0.113.1')
	})

	it.each([
		['a missing token', undefined, true],
		['a token that Cloudflare refuses', 'token', false],
	])('refuses %s', async (_, token, accepted) => {
		vi.mocked(turnstile).mockReturnValue({
			siteKey: 'key',
			verify: vi.fn().mockResolvedValue(accepted),
		})

		await expect(checkTurnstile(token)).rejects.toMatchObject({
			code: 'turnstile_failed',
			status: 400,
		})
	})
})

describe('registerUser', () => {
	it('returns user row on success', async () => {
		const user = await registerUser('new@example.com', 'password123', IP)

		expect(user?.id).toBe(TEST_USER.id)

		expect(user?.email).toBe(TEST_USER.email)
	})

	it('normalizes email before inserting', async () => {
		await registerUser('  Bob@EXAMPLE.COM  ', 'password123', IP)

		expect(mockRepo.insertUser).toHaveBeenCalledWith(
			'bob@example.com',
			expect.any(String),
			undefined,
		)
	})

	it('stores the name the user gave', async () => {
		await registerUser('bob@example.com', 'password123', IP, 'Bob Smith')

		expect(mockRepo.insertUser).toHaveBeenCalledWith(
			'bob@example.com',
			expect.any(String),
			'Bob Smith',
		)
	})

	it('hashes the password with Argon2id', async () => {
		await registerUser('bob@example.com', 'password123', IP)

		const hashed = mockRepo.insertUser.mock.calls[0][1] as string

		expect(hashed).toContain('$argon2')
	})

	it('refuses a password known from a data breach before making the account', async () => {
		vi.mocked(isBreachedPassword).mockResolvedValue(true)

		await expect(registerUser('bob@example.com', 'password123', IP)).rejects.toMatchObject({
			code: 'password_breached',
		})

		expect(mockRepo.insertUser).not.toHaveBeenCalled()
	})

	it('returns null when the email already has an account', async () => {
		mockRepo.insertUser.mockResolvedValue(null)

		expect(await registerUser('alice@example.com', 'password123', IP)).toBeNull()
	})

	it('re-throws non-duplicate errors', async () => {
		mockRepo.insertUser.mockRejectedValue(new Error('connection refused'))

		await expect(registerUser('bob@example.com', 'password123', IP)).rejects.toThrow(
			'connection refused',
		)
	})

	it("counts the sign-up against the address's network", async () => {
		await registerUser('new@example.com', 'password123', '1.2.3.4')

		expect(mockRepo.countSignUp).toHaveBeenCalledWith('1.2.3.4', MAX_DAILY_SIGN_UPS)
	})

	it('counts a sign-up for a taken email the same way', async () => {
		mockRepo.insertUser.mockResolvedValue(null)

		await registerUser('alice@example.com', 'password123', '1.2.3.4')

		expect(mockRepo.countSignUp).toHaveBeenCalledOnce()
	})

	it('refuses a sign-up past the daily limit without making the account', async () => {
		mockRepo.countSignUp.mockResolvedValue(false)

		await expect(registerUser('new@example.com', 'password123', '1.2.3.4')).rejects.toMatchObject({
			code: 'too_many_sign_ups',
			status: 429,
		})

		expect(mockRepo.insertUser).not.toHaveBeenCalled()
	})

	it('does not count a password refused for a data breach', async () => {
		vi.mocked(isBreachedPassword).mockResolvedValue(true)

		await expect(registerUser('bob@example.com', 'password123', '1.2.3.4')).rejects.toThrow()

		expect(mockRepo.countSignUp).not.toHaveBeenCalled()
	})

	it('reports the sign-up to Vidar', async () => {
		await registerUser('new@example.com', 'password123', '1.2.3.4')

		expect(reportEvent).toHaveBeenCalledWith(
			'registration',
			'1.2.3.4',
			{ email: 'new@example.com' },
			'bifrost',
		)
	})
})
