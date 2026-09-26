const { mockAuthenticatePasskey } = vi.hoisted(() => ({
	mockAuthenticatePasskey: vi.fn(),
}))

vi.mock('../passkeys.js', () => ({
	authenticatePasskey: (...args: unknown[]) => mockAuthenticatePasskey(...args),
}))

import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import type { User } from 'skuld'
import type { Mock } from 'vitest'
import { type AuthSecurityEvent, configure } from '../config.js'
import {
	completeLoginTicket,
	confirmTotp,
	createLoginTicket,
	deleteLoginTicket,
	deleteTotp,
	findLoginTicket,
	generateRecoveryCodes,
	MAX_TICKET_ATTEMPTS,
	RECOVERY_CODE_COUNT,
	secondFactorMethods,
	startTotpSetup,
} from '../mfa.js'
import { hashToken } from '../sessions.js'
import { encryptSecret, totpCode, totpStep } from '../totp.js'
import type {
	MfaRepository,
	PasskeyRepository,
	SessionRepository,
	UserRepository,
} from '../types.js'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const KEY = 'k'.repeat(32)

const user: User = {
	id: USER_ID,
	email: 'alice@example.com',
	is_active: true,
	is_verified: false,
	role: 'user',
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
}

const secret = Buffer.from('12345678901234567890')

let mfaRepository: { [K in keyof MfaRepository]: Mock<MfaRepository[K]> }

let userRepository: UserRepository

let onSecurityEvent: Mock<(event: AuthSecurityEvent) => void>

function setUp(key?: string) {
	configure({
		userRepository,
		sessionRepository: {} as SessionRepository,
		passkeyRepository: {} as PasskeyRepository,
		mfaRepository,
		passkeys: { domain: 'ivoryimage.dev', origins: ['https://admin.ivoryimage.dev'] },
		mfa: { key, issuer: 'ivoryimage.dev' },
		onSecurityEvent,
	})
}

beforeEach(() => {
	vi.resetAllMocks()

	mfaRepository = {
		getFactors: vi.fn().mockResolvedValue({ passkeys: 0, totp: true, recovery_codes: 10 }),
		getTotp: vi
			.fn()
			.mockResolvedValue({ secret: encryptSecret(secret, KEY), last_step: 0, confirmed: true }),
		setPendingTotp: vi.fn().mockResolvedValue('created'),
		confirmTotp: vi.fn().mockResolvedValue(true),
		useTotpStep: vi.fn().mockResolvedValue(true),
		deleteTotp: vi.fn().mockResolvedValue('deleted'),
		replaceRecoveryCodes: vi.fn(),
		useRecoveryCode: vi.fn().mockResolvedValue(true),
		createTicket: vi.fn(),
		useTicketAttempt: vi.fn().mockResolvedValue(USER_ID),
		findTicket: vi.fn().mockResolvedValue(USER_ID),
		deleteTicket: vi.fn(),
		deleteExpiredTickets: vi.fn(),
	}

	userRepository = { getUserById: vi.fn().mockResolvedValue(user) } as unknown as UserRepository

	onSecurityEvent = vi.fn()

	setUp(KEY)
})

describe('secondFactorMethods', () => {
	it.each([
		[{ passkeys: 0, totp: false, recovery_codes: 0 }, []],
		[{ passkeys: 0, totp: false, recovery_codes: 4 }, []],
		[{ passkeys: 2, totp: false, recovery_codes: 0 }, ['passkey']],
		[{ passkeys: 0, totp: true, recovery_codes: 1 }, ['totp', 'recovery_code']],
		[{ passkeys: 1, totp: true, recovery_codes: 3 }, ['passkey', 'totp', 'recovery_code']],
	])('offers %o as %o', (factors, methods) => {
		expect(secondFactorMethods(factors)).toEqual(methods)
	})
})

describe('createLoginTicket', () => {
	it('stores only the hash of the token, for five minutes', async () => {
		const before = Date.now()

		const token = await createLoginTicket(USER_ID)

		const [id, userId, expiresAt] = mfaRepository.createTicket.mock.calls[0] ?? []

		expect(id).toBe(hashToken(token))

		expect(userId).toBe(USER_ID)

		expect((expiresAt as Date).getTime() - before).toBeGreaterThanOrEqual(5 * 60 * 1000)

		expect((expiresAt as Date).getTime() - before).toBeLessThan(5 * 60 * 1000 + 1000)
	})
})

describe('findLoginTicket', () => {
	it('returns the user without spending an attempt', async () => {
		await expect(findLoginTicket('token')).resolves.toBe(USER_ID)

		expect(mfaRepository.findTicket).toHaveBeenCalledWith(hashToken('token'), MAX_TICKET_ATTEMPTS)

		expect(mfaRepository.useTicketAttempt).not.toHaveBeenCalled()
	})

	it('asks to sign in again for a spent ticket', async () => {
		mfaRepository.findTicket.mockResolvedValueOnce(null)

		await expect(findLoginTicket('token')).rejects.toMatchObject({ code: 'sign_in_expired' })
	})
})

describe('deleteLoginTicket', () => {
	it('deletes the ticket by the hash of its token', async () => {
		await deleteLoginTicket('token')

		expect(mfaRepository.deleteTicket).toHaveBeenCalledWith(hashToken('token'))
	})
})

describe('completeLoginTicket', () => {
	it('accepts a current authenticator code and records its step', async () => {
		await expect(
			completeLoginTicket('token', { totp: totpCode(secret, totpStep()) }),
		).resolves.toBe(USER_ID)

		expect(mfaRepository.useTicketAttempt).toHaveBeenCalledWith(
			hashToken('token'),
			MAX_TICKET_ATTEMPTS,
		)

		expect(mfaRepository.useTotpStep).toHaveBeenCalledWith(USER_ID, expect.any(Number))

		expect(mfaRepository.deleteTicket).toHaveBeenCalledWith(hashToken('token'))
	})

	it('refuses a replayed authenticator code', async () => {
		mfaRepository.useTotpStep.mockResolvedValueOnce(false)

		await expect(
			completeLoginTicket('token', { totp: totpCode(secret, totpStep()) }),
		).rejects.toMatchObject({ code: 'invalid_credentials' })

		expect(mfaRepository.deleteTicket).not.toHaveBeenCalled()
	})

	it('refuses a wrong authenticator code and reports it', async () => {
		const wrong = totpCode(secret, totpStep() + 5)

		await expect(
			completeLoginTicket('token', { totp: wrong }, '203.0.113.7'),
		).rejects.toMatchObject({
			code: 'invalid_credentials',
		})

		expect(onSecurityEvent).toHaveBeenCalledWith({
			type: 'login_failed',
			ip: '203.0.113.7',
			details: { user_id: USER_ID, method: 'totp' },
		})
	})

	it('refuses an authenticator code when the app is not confirmed', async () => {
		mfaRepository.getTotp.mockResolvedValueOnce({
			secret: encryptSecret(secret, KEY),
			last_step: 0,
			confirmed: false,
		})

		await expect(
			completeLoginTicket('token', { totp: totpCode(secret, totpStep()) }),
		).rejects.toMatchObject({ code: 'invalid_credentials' })
	})

	it('uses a recovery code whatever its case and dashes', async () => {
		await completeLoginTicket('token', { recovery_code: 'ABCDE-FGHJK' })

		const [, lower] = mfaRepository.useRecoveryCode.mock.calls[0] ?? []

		await completeLoginTicket('token', { recovery_code: 'abcdefghjk' })

		expect(mfaRepository.useRecoveryCode.mock.calls[1]?.[1]).toBe(lower)
	})

	it('refuses a used or unknown recovery code', async () => {
		mfaRepository.useRecoveryCode.mockResolvedValueOnce(false)

		await expect(
			completeLoginTicket('token', { recovery_code: 'abcde-fghjk' }),
		).rejects.toMatchObject({ code: 'invalid_credentials' })
	})

	it("accepts the user's own passkey", async () => {
		mockAuthenticatePasskey.mockResolvedValueOnce(USER_ID)

		const passkey = { id: 'credential-1' } as AuthenticationResponseJSON

		await expect(completeLoginTicket('token', { passkey })).resolves.toBe(USER_ID)
	})

	it("refuses another user's passkey", async () => {
		mockAuthenticatePasskey.mockResolvedValueOnce('00000000-0000-4000-8000-000000000002')

		const passkey = { id: 'credential-9' } as AuthenticationResponseJSON

		await expect(completeLoginTicket('token', { passkey })).rejects.toMatchObject({
			code: 'invalid_credentials',
		})
	})

	it('refuses a passkey that fails to verify', async () => {
		mockAuthenticatePasskey.mockRejectedValueOnce(new Error('bad signature'))

		const passkey = { id: 'credential-1' } as AuthenticationResponseJSON

		await expect(completeLoginTicket('token', { passkey })).rejects.toMatchObject({
			code: 'invalid_credentials',
		})
	})

	it('asks to sign in again when the ticket is spent or expired', async () => {
		mfaRepository.useTicketAttempt.mockResolvedValueOnce(null)

		await expect(completeLoginTicket('token', { totp: '123456' })).rejects.toMatchObject({
			code: 'sign_in_expired',
		})

		expect(mfaRepository.getTotp).not.toHaveBeenCalled()
	})

	it('refuses an account deactivated during the sign-in', async () => {
		vi.mocked(userRepository.getUserById).mockResolvedValueOnce({ ...user, is_active: false })

		await expect(
			completeLoginTicket('token', { totp: totpCode(secret, totpStep()) }),
		).rejects.toMatchObject({ code: 'account_inactive' })
	})
})

describe('startTotpSetup', () => {
	it('stores the secret encrypted and returns it with its URI', async () => {
		const { secret: shown, uri } = await startTotpSetup(user)

		const [userId, stored] = mfaRepository.setPendingTotp.mock.calls[0] ?? []

		expect(userId).toBe(USER_ID)

		expect(Buffer.from(stored as Uint8Array).toString('latin1')).not.toContain(shown)

		expect(uri).toContain(`secret=${shown}`)

		expect(uri).toContain('issuer=ivoryimage.dev')
	})

	it('refuses while an authenticator app is on', async () => {
		mfaRepository.setPendingTotp.mockResolvedValueOnce('exists')

		await expect(startTotpSetup(user)).rejects.toMatchObject({ code: 'totp_exists' })
	})

	it('reports authenticator apps unavailable without a key', async () => {
		setUp()

		await expect(startTotpSetup(user)).rejects.toMatchObject({ code: 'mfa_unavailable' })

		expect(mfaRepository.setPendingTotp).not.toHaveBeenCalled()
	})
})

describe('confirmTotp', () => {
	beforeEach(() => {
		mfaRepository.getTotp.mockResolvedValue({
			secret: encryptSecret(secret, KEY),
			last_step: 0,
			confirmed: false,
		})
	})

	it('turns the app on with a current code', async () => {
		await confirmTotp(USER_ID, totpCode(secret, totpStep()))

		expect(mfaRepository.confirmTotp).toHaveBeenCalledWith(USER_ID, expect.any(Number))
	})

	it('refuses a wrong code', async () => {
		await expect(confirmTotp(USER_ID, totpCode(secret, totpStep() + 5))).rejects.toMatchObject({
			code: 'code_rejected',
		})

		expect(mfaRepository.confirmTotp).not.toHaveBeenCalled()
	})

	it('reports nothing to confirm when the app is already on', async () => {
		mfaRepository.getTotp.mockResolvedValueOnce({
			secret: encryptSecret(secret, KEY),
			last_step: 0,
			confirmed: true,
		})

		await expect(confirmTotp(USER_ID, '123456')).rejects.toMatchObject({ code: 'totp_not_found' })
	})
})

describe('deleteTotp', () => {
	it.each([
		['not_found', 'totp_not_found'],
		['last_admin_factor', 'last_admin_factor'],
	] as const)('turns %s into the %s error', async (result, code) => {
		mfaRepository.deleteTotp.mockResolvedValueOnce(result)

		await expect(deleteTotp(USER_ID)).rejects.toMatchObject({ code })
	})
})

describe('generateRecoveryCodes', () => {
	it('stores the hashes of ten new codes and returns the codes', async () => {
		const codes = await generateRecoveryCodes(USER_ID)

		expect(codes).toHaveLength(RECOVERY_CODE_COUNT)

		expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT)

		for (const code of codes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/)

		const [userId, hashes] = mfaRepository.replaceRecoveryCodes.mock.calls[0] ?? []

		expect(userId).toBe(USER_ID)

		expect(hashes).toHaveLength(RECOVERY_CODE_COUNT)

		expect(hashes).not.toContain(codes[0])
	})

	it('refuses without a second factor', async () => {
		mfaRepository.getFactors.mockResolvedValueOnce({ passkeys: 0, totp: false, recovery_codes: 0 })

		await expect(generateRecoveryCodes(USER_ID)).rejects.toMatchObject({
			code: 'no_second_factor',
		})

		expect(mfaRepository.replaceRecoveryCodes).not.toHaveBeenCalled()
	})
})
