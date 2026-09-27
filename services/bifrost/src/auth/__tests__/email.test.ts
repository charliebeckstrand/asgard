import { verify } from '@node-rs/argon2'
import type { Mock } from 'vitest'
import { configure } from '../config.js'
import {
	EMAIL_INTERVAL_SECONDS,
	RESET_PASSWORD_TTL_SECONDS,
	requestPasswordReset,
	resetPassword,
	sendVerificationEmail,
	VERIFY_EMAIL_TTL_SECONDS,
	verifyEmail,
} from '../email.js'
import { AuthError } from '../errors.js'
import { hashToken } from '../sessions.js'
import type {
	Email,
	EmailTokenRepository,
	MfaRepository,
	OAuthRepository,
	PasskeyRepository,
	SessionRepository,
	UserRepository,
} from '../types.js'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const ORIGIN = 'https://places.example.com'

let emailTokenRepository: { [K in keyof EmailTokenRepository]: Mock<EmailTokenRepository[K]> }

let userRepository: { getCredentialsByEmail: Mock<UserRepository['getCredentialsByEmail']> }

let sendEmail: Mock<(email: Email) => Promise<void>>

beforeEach(() => {
	emailTokenRepository = {
		createToken: vi.fn().mockResolvedValue(true),
		verifyEmail: vi.fn().mockResolvedValue(true),
		resetPassword: vi.fn().mockResolvedValue(true),
		deleteExpiredTokens: vi.fn(),
	}

	userRepository = {
		getCredentialsByEmail: vi
			.fn()
			.mockResolvedValue({ id: USER_ID, hashed_password: 'h', is_active: true }),
	}

	sendEmail = vi.fn().mockResolvedValue(undefined)

	configure({
		userRepository: userRepository as unknown as UserRepository,
		sessionRepository: {} as SessionRepository,
		passkeyRepository: {} as PasskeyRepository,
		passkeys: { domain: 'localhost', origins: [ORIGIN] },
		mfaRepository: {} as MfaRepository,
		mfa: { issuer: 'localhost' },
		oauthRepository: {} as OAuthRepository,
		emailTokenRepository,
		sendEmail,
		oauth: {},
	})
})

/** The token in the link of the one email sent. */
function sentToken(path: string): string {
	const { text } = sendEmail.mock.calls[0]?.[0] as Email

	const link = text.split('\n').find((line) => line.startsWith(`${ORIGIN}${path}?token=`))

	return new URL(link as string).searchParams.get('token') as string
}

describe('sendVerificationEmail', () => {
	it('stores the hash of a new token and emails its link', async () => {
		await sendVerificationEmail({ id: USER_ID, email: 'alice@example.com' }, ORIGIN)

		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: 'alice@example.com', subject: 'Verify your email' }),
		)

		const token = sentToken('/verify-email')

		expect(token).toHaveLength(43)

		const [id, userId, purpose, expiresAt, interval] = emailTokenRepository.createToken.mock
			.calls[0] as Parameters<EmailTokenRepository['createToken']>

		expect([id, userId, purpose, interval]).toEqual([
			hashToken(token),
			USER_ID,
			'verify_email',
			EMAIL_INTERVAL_SECONDS,
		])

		expect(expiresAt.getTime()).toBeCloseTo(Date.now() + VERIFY_EMAIL_TTL_SECONDS * 1000, -4)
	})

	it('refuses to send another link within a minute', async () => {
		emailTokenRepository.createToken.mockResolvedValue(false)

		const sending = sendVerificationEmail({ id: USER_ID, email: 'alice@example.com' }, ORIGIN)

		await expect(sending).rejects.toMatchObject({ code: 'email_recently_sent', status: 429 })

		expect(sendEmail).not.toHaveBeenCalled()
	})
})

describe('verifyEmail', () => {
	it('uses the hash of the token', async () => {
		await verifyEmail('token')

		expect(emailTokenRepository.verifyEmail).toHaveBeenCalledWith(hashToken('token'))
	})

	it('rejects an unknown, used or expired link', async () => {
		emailTokenRepository.verifyEmail.mockResolvedValue(false)

		await expect(verifyEmail('token')).rejects.toBeInstanceOf(AuthError)

		await expect(verifyEmail('token')).rejects.toMatchObject({ code: 'link_expired' })
	})
})

describe('requestPasswordReset', () => {
	it('emails a reset link to an active user', async () => {
		await requestPasswordReset(' Alice@Example.com ', ORIGIN)

		expect(userRepository.getCredentialsByEmail).toHaveBeenCalledWith('alice@example.com')

		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: 'alice@example.com', subject: 'Reset your password' }),
		)

		const [id, userId, purpose, expiresAt] = emailTokenRepository.createToken.mock
			.calls[0] as Parameters<EmailTokenRepository['createToken']>

		expect([id, userId, purpose]).toEqual([
			hashToken(sentToken('/reset-password')),
			USER_ID,
			'reset_password',
		])

		expect(expiresAt.getTime()).toBeCloseTo(Date.now() + RESET_PASSWORD_TTL_SECONDS * 1000, -4)
	})

	it.each([
		['no user has the email', null],
		['the user is inactive', { id: USER_ID, hashed_password: 'h', is_active: false }],
	])('sends nothing when %s', async (_, creds) => {
		userRepository.getCredentialsByEmail.mockResolvedValue(creds)

		await requestPasswordReset('alice@example.com', ORIGIN)

		expect(emailTokenRepository.createToken).not.toHaveBeenCalled()

		expect(sendEmail).not.toHaveBeenCalled()
	})

	it('sends nothing within a minute of the last link', async () => {
		emailTokenRepository.createToken.mockResolvedValue(false)

		await requestPasswordReset('alice@example.com', ORIGIN)

		expect(sendEmail).not.toHaveBeenCalled()
	})
})

describe('resetPassword', () => {
	it('stores an argon2 hash of the new password', async () => {
		await resetPassword('token', 'new password')

		const [id, hashedPassword] = emailTokenRepository.resetPassword.mock.calls[0] as [
			string,
			string,
		]

		expect(id).toBe(hashToken('token'))

		expect(await verify(hashedPassword, 'new password')).toBe(true)
	})

	it('rejects an unknown, used or expired link', async () => {
		emailTokenRepository.resetPassword.mockResolvedValue(false)

		await expect(resetPassword('token', 'new password')).rejects.toMatchObject({
			code: 'link_expired',
			status: 400,
		})
	})
})
