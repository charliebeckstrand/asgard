const { webauthn } = vi.hoisted(() => ({
	webauthn: {
		generateRegistrationOptions: vi.fn(),
		verifyRegistrationResponse: vi.fn(),
		generateAuthenticationOptions: vi.fn(),
		verifyAuthenticationResponse: vi.fn(),
	},
}))

vi.mock('@simplewebauthn/server', () => webauthn)

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { User } from 'skuld'
import type { Mock } from 'vitest'
import { type AuthSecurityEvent, configure } from '../config.js'
import {
	authenticatePasskey,
	CHALLENGE_TTL_SECONDS,
	createRegistrationOptions,
	createSecondFactorOptions,
	createSignInOptions,
	deletePasskey,
	getPasskeys,
	registerPasskey,
} from '../passkeys.js'
import type {
	MfaRepository,
	OAuthRepository,
	PasskeyRepository,
	SessionRepository,
	StoredPasskey,
	UserRepository,
} from '../types.js'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const user: User = {
	id: USER_ID,
	email: 'alice@example.com',
	is_active: true,
	is_verified: true,
	role: 'user',
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
}

const stored: StoredPasskey = {
	id: 'credential-1',
	user_id: USER_ID,
	public_key: new Uint8Array([1, 2, 3]),
	counter: 4,
	transports: ['internal'],
	created_at: '2026-09-26T00:00:00.000Z',
}

const passkeys = { domain: 'ivoryimage.dev', origins: ['https://admin.ivoryimage.dev'] }

const registration = { id: 'credential-2' } as RegistrationResponseJSON

const assertion = { id: 'credential-1' } as AuthenticationResponseJSON

let passkeyRepository: PasskeyRepository

let userRepository: UserRepository

let onSecurityEvent: Mock<(event: AuthSecurityEvent) => void>

beforeEach(() => {
	vi.resetAllMocks()

	passkeyRepository = {
		insertPasskey: vi.fn().mockResolvedValue({ id: 'credential-2', created_at: stored.created_at }),
		findPasskey: vi.fn().mockResolvedValue(stored),
		getPasskeys: vi.fn().mockResolvedValue([stored]),
		setCounter: vi.fn(),
		deletePasskey: vi.fn().mockResolvedValue('deleted'),
		createChallenge: vi.fn(),
		useChallenge: vi.fn().mockResolvedValue(true),
		deleteExpiredChallenges: vi.fn(),
	}

	userRepository = {
		getUserById: vi.fn().mockResolvedValue(user),
	} as unknown as UserRepository

	onSecurityEvent = vi.fn()

	configure({
		userRepository,
		sessionRepository: {} as SessionRepository,
		passkeyRepository,
		mfaRepository: {} as MfaRepository,
		passkeys,
		mfa: { issuer: 'localhost' },
		oauthRepository: {} as OAuthRepository,
		oauth: {},
		onSecurityEvent,
	})
})

describe('createRegistrationOptions', () => {
	beforeEach(() => {
		webauthn.generateRegistrationOptions.mockResolvedValue({ challenge: 'reg-challenge' })
	})

	it('asks for a discoverable passkey that verifies the user, and excludes existing ones', async () => {
		await createRegistrationOptions(user)

		expect(webauthn.generateRegistrationOptions).toHaveBeenCalledWith(
			expect.objectContaining({
				rpID: 'ivoryimage.dev',
				userName: user.email,
				attestationType: 'none',
				excludeCredentials: [{ id: 'credential-1', transports: ['internal'] }],
				authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
			}),
		)
	})

	it('stores the challenge for this user, with an expiry', async () => {
		const before = Date.now()

		await createRegistrationOptions(user)

		const [challenge, userId, expiresAt] = vi.mocked(passkeyRepository.createChallenge).mock
			.calls[0]

		expect(challenge).toBe('reg-challenge')

		expect(userId).toBe(USER_ID)

		expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + CHALLENGE_TTL_SECONDS * 1000)
	})
})

describe('registerPasskey', () => {
	it('stores a verified passkey', async () => {
		webauthn.verifyRegistrationResponse.mockResolvedValue({
			verified: true,
			registrationInfo: {
				credential: { id: 'credential-2', publicKey: new Uint8Array([9]), counter: 0 },
			},
		})

		await expect(registerPasskey(USER_ID, registration)).resolves.toEqual({
			id: 'credential-2',
			created_at: stored.created_at,
		})

		expect(passkeyRepository.insertPasskey).toHaveBeenCalledWith(USER_ID, {
			id: 'credential-2',
			publicKey: new Uint8Array([9]),
			counter: 0,
			transports: [],
		})
	})

	it("uses up a challenge issued to this user, from the domain's origins", async () => {
		webauthn.verifyRegistrationResponse.mockResolvedValue({ verified: false })

		await registerPasskey(USER_ID, registration).catch(() => {})

		const options = webauthn.verifyRegistrationResponse.mock.calls[0][0]

		expect(options).toEqual(
			expect.objectContaining({
				expectedOrigin: passkeys.origins,
				expectedRPID: 'ivoryimage.dev',
				requireUserVerification: true,
			}),
		)

		await options.expectedChallenge('reg-challenge')

		expect(passkeyRepository.useChallenge).toHaveBeenCalledWith('reg-challenge', USER_ID)
	})

	it.each([
		[
			'is not verified',
			() => webauthn.verifyRegistrationResponse.mockResolvedValue({ verified: false }),
		],
		['throws', () => webauthn.verifyRegistrationResponse.mockRejectedValue(new Error('bad'))],
	])('rejects a passkey that %s', async (_, arrange) => {
		arrange()

		await expect(registerPasskey(USER_ID, registration)).rejects.toMatchObject({
			code: 'passkey_rejected',
		})

		expect(passkeyRepository.insertPasskey).not.toHaveBeenCalled()
	})
})

describe('createSignInOptions', () => {
	it('stores a challenge with no user', async () => {
		webauthn.generateAuthenticationOptions.mockResolvedValue({ challenge: 'sign-in-challenge' })

		await createSignInOptions()

		expect(webauthn.generateAuthenticationOptions).toHaveBeenCalledWith({
			rpID: 'ivoryimage.dev',
			userVerification: 'required',
		})

		expect(passkeyRepository.createChallenge).toHaveBeenCalledWith(
			'sign-in-challenge',
			null,
			expect.any(Date),
		)
	})
})

describe('createSecondFactorOptions', () => {
	it("names the user's passkeys and stores a challenge with no user", async () => {
		webauthn.generateAuthenticationOptions.mockResolvedValue({ challenge: 'second-step' })

		await createSecondFactorOptions(USER_ID)

		expect(passkeyRepository.getPasskeys).toHaveBeenCalledWith(USER_ID)

		expect(webauthn.generateAuthenticationOptions).toHaveBeenCalledWith({
			rpID: 'ivoryimage.dev',
			userVerification: 'required',
			allowCredentials: [{ id: 'credential-1', transports: ['internal'] }],
		})

		expect(passkeyRepository.createChallenge).toHaveBeenCalledWith(
			'second-step',
			null,
			expect.any(Date),
		)
	})
})

describe('authenticatePasskey', () => {
	const verified = { verified: true, authenticationInfo: { newCounter: 5 } }

	it("returns the passkey's user and advances its counter", async () => {
		webauthn.verifyAuthenticationResponse.mockResolvedValue(verified)

		await expect(authenticatePasskey(assertion)).resolves.toBe(USER_ID)

		expect(passkeyRepository.setCounter).toHaveBeenCalledWith('credential-1', 5)
	})

	it('verifies against the stored key and uses up a sign-in challenge', async () => {
		webauthn.verifyAuthenticationResponse.mockResolvedValue(verified)

		await authenticatePasskey(assertion)

		const options = webauthn.verifyAuthenticationResponse.mock.calls[0][0]

		expect(options.credential).toEqual({
			id: 'credential-1',
			publicKey: stored.public_key,
			counter: 4,
			transports: ['internal'],
		})

		expect(options.requireUserVerification).toBe(true)

		await options.expectedChallenge('sign-in-challenge')

		expect(passkeyRepository.useChallenge).toHaveBeenCalledWith('sign-in-challenge', null)
	})

	it('rejects an unknown passkey without verifying, and reports it', async () => {
		vi.mocked(passkeyRepository.findPasskey).mockResolvedValue(null)

		await expect(authenticatePasskey(assertion, '203.0.113.7')).rejects.toMatchObject({
			code: 'invalid_credentials',
		})

		expect(webauthn.verifyAuthenticationResponse).not.toHaveBeenCalled()

		expect(onSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'login_failed', ip: '203.0.113.7' }),
		)
	})

	it('rejects a passkey that fails verification', async () => {
		webauthn.verifyAuthenticationResponse.mockRejectedValue(new Error('bad signature'))

		await expect(authenticatePasskey(assertion)).rejects.toMatchObject({
			code: 'invalid_credentials',
		})

		expect(passkeyRepository.setCounter).not.toHaveBeenCalled()
	})

	it('refuses an inactive user', async () => {
		webauthn.verifyAuthenticationResponse.mockResolvedValue(verified)

		vi.mocked(userRepository.getUserById).mockResolvedValue({ ...user, is_active: false })

		await expect(authenticatePasskey(assertion)).rejects.toMatchObject({
			code: 'account_inactive',
		})
	})
})

describe('getPasskeys', () => {
	it('returns only the id and the creation time', async () => {
		await expect(getPasskeys(USER_ID)).resolves.toEqual([
			{ id: 'credential-1', created_at: stored.created_at },
		])
	})
})

describe('deletePasskey', () => {
	it.each([
		['not_found', 'passkey_not_found'],
		['last_admin_factor', 'last_admin_factor'],
	] as const)('turns %s into the %s error', async (result, code) => {
		vi.mocked(passkeyRepository.deletePasskey).mockResolvedValue(result)

		await expect(deletePasskey(USER_ID, 'credential-1')).rejects.toMatchObject({ code })
	})

	it("deletes only among the user's own passkeys", async () => {
		await deletePasskey(USER_ID, 'credential-1')

		expect(passkeyRepository.deletePasskey).toHaveBeenCalledWith('credential-1', USER_ID)
	})
})
