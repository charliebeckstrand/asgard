import { hash } from '@node-rs/argon2'
import type { User } from 'skuld'
import { configure } from '../config.js'
import { AuthError, authenticateUser, registerUser } from '../credentials.js'
import type {
	CredentialsRow,
	PasskeyRepository,
	SessionRepository,
	UserRepository,
} from '../types.js'

const TEST_USER: User = {
	id: 'user-123',
	email: 'alice@example.com',
	is_active: true,
	is_verified: true,
	role: 'user',
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
			role: 'user',
		} satisfies CredentialsRow),
		getUsers: vi.fn().mockResolvedValue([]),
		getUserById: vi.fn().mockResolvedValue(TEST_USER),
		setUserActive: vi.fn().mockResolvedValue(TEST_USER),
	}

	mockSessionRepo = {
		createSession: vi.fn(),
		findSession: vi.fn(),
		deleteSession: vi.fn(),
		deleteUserSessions: vi.fn(),
		deleteExpiredSessions: vi.fn(),
	}

	configure({
		userRepository: mockRepo,
		sessionRepository: mockSessionRepo,
		passkeyRepository: {} as PasskeyRepository,
		passkeys: { domain: 'localhost', origins: ['http://localhost:3000'] },
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

	it('throws account_inactive for inactive user', async () => {
		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: false,
			role: 'user',
		})

		try {
			await authenticateUser('alice@example.com', 'correct-password')

			expect.unreachable('should have thrown')
		} catch (err) {
			expect((err as AuthError).code).toBe('account_inactive')
		}
	})

	it('refuses a password for an admin, even when it is correct', async () => {
		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: true,
			role: 'admin',
		})

		const err = await authenticateUser('alice@example.com', 'correct-password').catch((e) => e)

		expect((err as AuthError).code).toBe('passkey_required')
	})

	it('reports invalid_credentials, not passkey_required, for an admin with a wrong password', async () => {
		vi.mocked(mockRepo.getCredentialsByEmail).mockResolvedValue({
			id: TEST_USER.id,
			hashed_password: hashedPassword,
			is_active: true,
			role: 'admin',
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
			onSecurityEvent,
		})

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

	it('normalizes email before inserting', async () => {
		await registerUser('  Bob@EXAMPLE.COM  ', 'password123')

		expect(mockRepo.insertUser).toHaveBeenCalledWith(
			expect.any(String),
			'bob@example.com',
			expect.any(String),
		)
	})

	it('hashes the password with Argon2id', async () => {
		await registerUser('bob@example.com', 'password123')

		const hashed = vi.mocked(mockRepo.insertUser).mock.calls[0][2] as string

		expect(hashed).toContain('$argon2')
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
			onSecurityEvent,
		})

		await registerUser('new@example.com', 'password123', '1.2.3.4')

		expect(onSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'registration', ip: '1.2.3.4' }),
		)
	})
})
