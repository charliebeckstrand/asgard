import { hash } from '@node-rs/argon2'
import { AuthError, authenticateUser, refreshTokenPair, registerUser } from '../auth.js'
import { configure } from '../config.js'
import { signToken } from '../jwt.js'
import type { CredentialsRow, UserRepository, UserRow } from '../types.js'

const SECRET = 'a-test-secret-key-that-is-at-least-32-characters-long'

const TEST_USER: UserRow = {
	id: 'user-123',
	email: 'alice@example.com',
	is_active: true,
	is_verified: true,
	created_at: '2024-01-01T00:00:00Z',
	updated_at: '2024-01-01T00:00:00Z',
}

let hashedPassword: string

let mockRepo: UserRepository

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
		} satisfies CredentialsRow),
		getUserById: vi.fn().mockResolvedValue(TEST_USER),
	}

	configure({ userRepository: mockRepo, secretKey: SECRET })
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
	it('returns token pair for valid credentials', async () => {
		const result = await authenticateUser('alice@example.com', 'correct-password')

		expect(result.access_token).toBeTypeOf('string')
		expect(result.refresh_token).toBeTypeOf('string')
		expect(result.token_type).toBe('bearer')
	})

	it('normalizes email to lowercase', async () => {
		await authenticateUser('Alice@Example.COM', 'correct-password')

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

	it('throws account_inactive for inactive user', async () => {
		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: false,
		})

		try {
			await authenticateUser('alice@example.com', 'correct-password')

			expect.unreachable('should have thrown')
		} catch (err) {
			expect((err as AuthError).code).toBe('account_inactive')
		}
	})

	it('calls onSecurityEvent on failed login', async () => {
		const onSecurityEvent = vi.fn()

		configure({ userRepository: mockRepo, secretKey: SECRET, onSecurityEvent })

		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue(null)

		await authenticateUser('alice@example.com', 'wrong', '1.2.3.4').catch(() => {})

		expect(onSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'login_failed', ip: '1.2.3.4' }),
		)
	})
})

describe('registerUser', () => {
	it('returns user row on success', async () => {
		const user = await registerUser('new@example.com', 'password123')

		expect(user.id).toBe(TEST_USER.id)
		expect(user.email).toBe(TEST_USER.email)
	})

	it('throws email_exists on duplicate', async () => {
		vi.mocked(mockRepo.insertUser).mockRejectedValue({ code: '23505' })

		try {
			await registerUser('alice@example.com', 'password123')

			expect.unreachable('should have thrown')
		} catch (err) {
			expect((err as AuthError).code).toBe('email_exists')
		}
	})

	it('calls onSecurityEvent on registration', async () => {
		const onSecurityEvent = vi.fn()

		configure({ userRepository: mockRepo, secretKey: SECRET, onSecurityEvent })

		await registerUser('new@example.com', 'password123', '1.2.3.4')

		expect(onSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'registration', ip: '1.2.3.4' }),
		)
	})
})

describe('refreshTokenPair', () => {
	it('returns new token pair for valid refresh token', async () => {
		const refreshToken = await signToken(TEST_USER.id, 'refresh')

		const result = await refreshTokenPair(refreshToken)

		expect(result.access_token).toBeTypeOf('string')
		expect(result.refresh_token).toBeTypeOf('string')
		expect(result.token_type).toBe('bearer')
	})

	it('throws for access token (wrong type)', async () => {
		const accessToken = await signToken(TEST_USER.id, 'access')

		await expect(refreshTokenPair(accessToken)).rejects.toThrow(AuthError)
	})

	it('throws for inactive user', async () => {
		vi.mocked(mockRepo.getUserById).mockResolvedValue({ ...TEST_USER, is_active: false })

		const refreshToken = await signToken(TEST_USER.id, 'refresh')

		await expect(refreshTokenPair(refreshToken)).rejects.toThrow(AuthError)
	})

	it('throws for invalid token string', async () => {
		await expect(refreshTokenPair('garbage')).rejects.toThrow(AuthError)
	})
})
