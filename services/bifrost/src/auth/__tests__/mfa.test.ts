const { mockAuthenticatePasskey } = vi.hoisted(() => ({
	mockAuthenticatePasskey: vi.fn(),
}))

vi.mock('../passkeys.js', () => ({
	authenticatePasskey: (...args: unknown[]) => mockAuthenticatePasskey(...args),
}))

import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import type { Session, User } from 'skuld'
import type { Mock } from 'vitest'
import { type AuthSecurityEvent, configure } from '../config.js'
import {
	checkMfaKey,
	confirmTotp,
	deleteTotp,
	FAILED_STEP_WAIT_SECONDS,
	generateRecoveryCodes,
	MAX_FAILED_STEPS,
	RECOVERY_CODE_COUNT,
	secondFactorMethods,
	startTotpSetup,
	verifySession,
} from '../mfa.js'
import { encryptSecret, totpCode, totpStep } from '../totp.js'
import type {
	ActivityRepository,
	EmailTokenRepository,
	MfaRepository,
	OAuthRepository,
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
	roles: ['user'],
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
}

const session: Session = {
	id: 'session-1',
	created_at: '2026-01-01T00:00:00.000Z',
	expires_at: '2026-01-31T00:00:00.000Z',
	two_step: false,
	user,
}

const secret = Buffer.from('12345678901234567890')

let mfaRepository: { [K in keyof MfaRepository]: Mock<MfaRepository[K]> }

let sessionRepository: Pick<
	{ [K in keyof SessionRepository]: Mock<SessionRepository[K]> },
	'passSecondStep' | 'failSecondStep'
>

let onSecurityEvent: Mock<(event: AuthSecurityEvent) => void>

function setUp(key?: string) {
	configure({
		userRepository: {} as UserRepository,
		sessionRepository: sessionRepository as unknown as SessionRepository,
		passkeyRepository: {} as PasskeyRepository,
		mfaRepository,
		passkeys: { domain: 'ivoryimage.dev', origins: ['https://admin.ivoryimage.dev'] },
		mfa: { key, issuer: 'ivoryimage.dev' },
		oauthRepository: {} as OAuthRepository,
		emailTokenRepository: {} as EmailTokenRepository,
		activityRepository: {} as ActivityRepository,
		sendEmail: vi.fn(),
		oauth: {},
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
		getLatestSecret: vi.fn().mockResolvedValue(encryptSecret(secret, KEY)),
		setPendingTotp: vi.fn().mockResolvedValue('created'),
		confirmTotp: vi.fn().mockResolvedValue(true),
		useTotpStep: vi.fn().mockResolvedValue(true),
		deleteTotp: vi.fn().mockResolvedValue('deleted'),
		replaceRecoveryCodes: vi.fn(),
		useRecoveryCode: vi.fn().mockResolvedValue(true),
		countFailedStep: vi.fn().mockResolvedValue(true),
		clearFailedSteps: vi.fn(),
		deleteStaleFailedSteps: vi.fn(),
	}

	sessionRepository = {
		passSecondStep: vi.fn(),
		failSecondStep: vi.fn().mockResolvedValue(false),
	}

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

describe('checkMfaKey', () => {
	it('accepts a key that decrypts the stored secrets', async () => {
		expect(await checkMfaKey()).toBeNull()
	})

	it('accepts any key, or none, when no secrets are stored', async () => {
		mfaRepository.getLatestSecret.mockResolvedValue(null)

		expect(await checkMfaKey()).toBeNull()

		setUp(undefined)

		expect(await checkMfaKey()).toBeNull()
	})

	it('refuses a different key', async () => {
		setUp('d'.repeat(32))

		expect(await checkMfaKey()).toMatch('does not decrypt')
	})

	it('refuses a missing key when secrets are stored', async () => {
		setUp(undefined)

		expect(await checkMfaKey()).toMatch('is unset')
	})
})

describe('verifySession', () => {
	it('passes the session with a current authenticator code and records its step', async () => {
		await verifySession(session, { totp: totpCode(secret, totpStep()) })

		expect(mfaRepository.useTotpStep).toHaveBeenCalledWith(USER_ID, expect.any(Number))

		expect(sessionRepository.passSecondStep).toHaveBeenCalledWith('session-1')

		expect(sessionRepository.failSecondStep).not.toHaveBeenCalled()

		expect(mfaRepository.clearFailedSteps).toHaveBeenCalledWith(USER_ID)
	})

	it('counts each try against the user, across sessions, before checking it', async () => {
		await verifySession(session, { totp: '000000' }).catch(() => {})

		expect(mfaRepository.countFailedStep).toHaveBeenCalledWith(
			USER_ID,
			MAX_FAILED_STEPS,
			FAILED_STEP_WAIT_SECONDS,
		)

		expect(mfaRepository.clearFailedSteps).not.toHaveBeenCalled()
	})

	it('makes the user wait past their wrong tries, even with a right code', async () => {
		mfaRepository.countFailedStep.mockResolvedValueOnce(false)

		await expect(
			verifySession(session, { totp: totpCode(secret, totpStep()) }),
		).rejects.toMatchObject({ code: 'too_many_steps' })

		expect(mfaRepository.useTotpStep).not.toHaveBeenCalled()

		expect(sessionRepository.passSecondStep).not.toHaveBeenCalled()
	})

	it('refuses a replayed authenticator code', async () => {
		mfaRepository.useTotpStep.mockResolvedValueOnce(false)

		await expect(
			verifySession(session, { totp: totpCode(secret, totpStep()) }),
		).rejects.toMatchObject({ code: 'code_rejected' })

		expect(sessionRepository.passSecondStep).not.toHaveBeenCalled()
	})

	it('counts a wrong authenticator code against the session and reports it', async () => {
		const wrong = totpCode(secret, totpStep() + 5)

		await expect(verifySession(session, { totp: wrong }, '203.0.113.7')).rejects.toMatchObject({
			code: 'code_rejected',
		})

		expect(sessionRepository.failSecondStep).toHaveBeenCalledWith('session-1', MAX_FAILED_STEPS)

		expect(onSecurityEvent).toHaveBeenCalledWith({
			type: 'login_failed',
			ip: '203.0.113.7',
			details: { user_id: USER_ID, method: 'totp' },
		})
	})

	it('asks to sign in again when a wrong try ends the session', async () => {
		sessionRepository.failSecondStep.mockResolvedValueOnce(true)

		await expect(verifySession(session, { totp: '000000' })).rejects.toMatchObject({
			code: 'sign_in_expired',
		})
	})

	it('refuses an authenticator code when the app is not confirmed', async () => {
		mfaRepository.getTotp.mockResolvedValueOnce({
			secret: encryptSecret(secret, KEY),
			last_step: 0,
			confirmed: false,
		})

		await expect(
			verifySession(session, { totp: totpCode(secret, totpStep()) }),
		).rejects.toMatchObject({ code: 'code_rejected' })
	})

	it('uses a recovery code whatever its case and dashes', async () => {
		await verifySession(session, { recovery_code: 'ABCDE-FGHJK' })

		const [, lower] = mfaRepository.useRecoveryCode.mock.calls[0] ?? []

		await verifySession(session, { recovery_code: 'abcdefghjk' })

		expect(mfaRepository.useRecoveryCode.mock.calls[1]?.[1]).toBe(lower)
	})

	it('refuses a used or unknown recovery code', async () => {
		mfaRepository.useRecoveryCode.mockResolvedValueOnce(false)

		await expect(verifySession(session, { recovery_code: 'abcde-fghjk' })).rejects.toMatchObject({
			code: 'code_rejected',
		})
	})

	it("accepts the user's own passkey", async () => {
		mockAuthenticatePasskey.mockResolvedValueOnce(USER_ID)

		const passkey = { id: 'credential-1' } as AuthenticationResponseJSON

		await verifySession(session, { passkey })

		expect(sessionRepository.passSecondStep).toHaveBeenCalledWith('session-1')
	})

	it("refuses another user's passkey", async () => {
		mockAuthenticatePasskey.mockResolvedValueOnce('00000000-0000-4000-8000-000000000002')

		const passkey = { id: 'credential-9' } as AuthenticationResponseJSON

		await expect(verifySession(session, { passkey })).rejects.toMatchObject({
			code: 'code_rejected',
		})
	})

	it('refuses a passkey that fails to verify', async () => {
		mockAuthenticatePasskey.mockRejectedValueOnce(new Error('bad signature'))

		const passkey = { id: 'credential-1' } as AuthenticationResponseJSON

		await expect(verifySession(session, { passkey })).rejects.toMatchObject({
			code: 'code_rejected',
		})
	})

	it('refuses a user without a second factor', async () => {
		mfaRepository.getFactors.mockResolvedValueOnce({ passkeys: 0, totp: false, recovery_codes: 0 })

		await expect(verifySession(session, { totp: '123456' })).rejects.toMatchObject({
			code: 'no_second_factor',
		})

		expect(sessionRepository.failSecondStep).not.toHaveBeenCalled()

		expect(mfaRepository.countFailedStep).not.toHaveBeenCalled()
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
