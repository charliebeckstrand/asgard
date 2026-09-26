import { createHash } from 'node:crypto'
import type { User } from 'skuld'
import type { Mock } from 'vitest'
import { type AuthSecurityEvent, configure } from '../config.js'
import {
	completeOAuth,
	enabledProviders,
	OAuthFailure,
	safeReturnTo,
	startOAuth,
	unlinkIdentity,
} from '../oauth.js'
import { hashToken } from '../sessions.js'
import type {
	MfaRepository,
	OAuthRepository,
	PasskeyRepository,
	SessionRepository,
	StoredOAuthState,
	UserRepository,
} from '../types.js'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const ORIGIN = 'https://admin.ivoryimage.dev'

const user: User = {
	id: USER_ID,
	email: 'alice@example.com',
	is_active: true,
	is_verified: true,
	role: 'user',
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
}

const signInState: StoredOAuthState = {
	provider: 'google',
	verifier: 'the-verifier',
	origin: ORIGIN,
	return_to: '/users',
	user_id: null,
}

let oauthRepository: { [K in keyof OAuthRepository]: Mock<OAuthRepository[K]> }

let getUserById: Mock<UserRepository['getUserById']>

let onSecurityEvent: Mock<(event: AuthSecurityEvent) => void>

let fetchMock: Mock<typeof fetch>

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})
}

/** Answers the token exchange and the account reads of one provider. */
function providerAnswers(routes: Record<string, unknown>) {
	fetchMock.mockImplementation(async (input) => {
		const url = String(input)

		const match = Object.keys(routes).find((prefix) => url.startsWith(prefix))

		return match ? json(routes[match]) : json({ message: 'Not found' }, 404)
	})
}

function googleAnswers(info: Record<string, unknown>) {
	providerAnswers({
		'https://oauth2.googleapis.com/token': { access_token: 'google-token' },
		'https://openidconnect.googleapis.com/v1/userinfo': info,
	})
}

function githubAnswers(emails: unknown[]) {
	providerAnswers({
		'https://github.com/login/oauth/access_token': { access_token: 'github-token' },
		'https://api.github.com/user/emails': emails,
		'https://api.github.com/user': { id: 42 },
	})
}

beforeEach(() => {
	vi.resetAllMocks()

	oauthRepository = {
		createState: vi.fn(),
		useState: vi.fn().mockResolvedValue(signInState),
		deleteExpiredStates: vi.fn(),
		findIdentityUser: vi.fn().mockResolvedValue(null),
		createUserWithIdentity: vi.fn().mockResolvedValue({ userId: USER_ID }),
		linkIdentity: vi.fn().mockResolvedValue('linked'),
		getIdentities: vi.fn(),
		unlinkIdentity: vi.fn().mockResolvedValue('deleted'),
	}

	getUserById = vi.fn().mockResolvedValue(user)

	onSecurityEvent = vi.fn()

	fetchMock = vi.fn()

	vi.stubGlobal('fetch', fetchMock)

	configure({
		userRepository: { getUserById } as unknown as UserRepository,
		sessionRepository: {} as SessionRepository,
		passkeyRepository: {} as PasskeyRepository,
		mfaRepository: {} as MfaRepository,
		passkeys: { domain: 'ivoryimage.dev', origins: [ORIGIN] },
		mfa: { issuer: 'ivoryimage.dev' },
		oauthRepository,
		oauth: {
			google: { clientId: 'google-id', clientSecret: 'google-secret' },
			github: { clientId: 'github-id', clientSecret: 'github-secret' },
		},
		onSecurityEvent,
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('enabledProviders', () => {
	it('lists only the providers with a client', () => {
		configure({
			userRepository: {} as UserRepository,
			sessionRepository: {} as SessionRepository,
			passkeyRepository: {} as PasskeyRepository,
			mfaRepository: {} as MfaRepository,
			passkeys: { domain: 'ivoryimage.dev', origins: [ORIGIN] },
			mfa: { issuer: 'ivoryimage.dev' },
			oauthRepository,
			oauth: { google: { clientId: 'id', clientSecret: 'secret' } },
		})

		expect(enabledProviders()).toEqual(['google'])
	})
})

describe('safeReturnTo', () => {
	it.each([
		['/users', '/users'],
		['/users?page=2', '/users?page=2'],
		[undefined, '/'],
		['', '/'],
		['https://evil.example', '/'],
		['//evil.example', '/'],
		['/\\evil.example', '/'],
		['users', '/'],
	])('turns %s into %s', (value, expected) => {
		expect(safeReturnTo(value, '/')).toBe(expected)
	})
})

describe('startOAuth', () => {
	it('stores the hashed state with a PKCE verifier and points at the provider', async () => {
		const { state, url } = await startOAuth('google', { origin: ORIGIN, returnTo: '/users' })

		const [id, stored, expiresAt] = oauthRepository.createState.mock.calls[0] ?? []

		expect(id).toBe(hashToken(state))

		expect(stored).toMatchObject({
			provider: 'google',
			origin: ORIGIN,
			return_to: '/users',
			user_id: null,
		})

		expect(expiresAt?.getTime()).toBeGreaterThan(Date.now())

		const target = new URL(url)

		expect(target.origin + target.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')

		expect(Object.fromEntries(target.searchParams)).toEqual({
			client_id: 'google-id',
			redirect_uri: `${ORIGIN}/auth/oauth/google/callback`,
			response_type: 'code',
			scope: 'openid email',
			state,
			code_challenge: createHash('sha256')
				.update(stored?.verifier ?? '')
				.digest('base64url'),
			code_challenge_method: 'S256',
		})
	})

	it('binds the state to the user who connects an account', async () => {
		await startOAuth('github', { origin: ORIGIN, returnTo: '/account', linkUserId: USER_ID })

		expect(oauthRepository.createState.mock.calls[0]?.[1]).toMatchObject({
			provider: 'github',
			user_id: USER_ID,
		})
	})

	it('refuses a provider without a client', async () => {
		configure({
			userRepository: {} as UserRepository,
			sessionRepository: {} as SessionRepository,
			passkeyRepository: {} as PasskeyRepository,
			mfaRepository: {} as MfaRepository,
			passkeys: { domain: 'ivoryimage.dev', origins: [ORIGIN] },
			mfa: { issuer: 'ivoryimage.dev' },
			oauthRepository,
			oauth: {},
		})

		await expect(startOAuth('google', { origin: ORIGIN, returnTo: '/' })).rejects.toMatchObject({
			code: 'oauth_unavailable',
		})

		expect(oauthRepository.createState).not.toHaveBeenCalled()
	})
})

describe('completeOAuth', () => {
	it('fails without a live state for the provider', async () => {
		oauthRepository.useState.mockResolvedValue(null)

		await expect(completeOAuth('google', 'state', 'code')).rejects.toMatchObject({
			code: 'oauth_failed',
		})

		oauthRepository.useState.mockResolvedValue({ ...signInState, provider: 'github' })

		await expect(completeOAuth('google', 'state', 'code')).rejects.toMatchObject({
			code: 'oauth_failed',
		})

		expect(oauthRepository.useState).toHaveBeenCalledWith(hashToken('state'))

		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('trades the code with the verifier and the same redirect URI', async () => {
		googleAnswers({ sub: 'g-1', email: 'alice@example.com', email_verified: true })

		await completeOAuth('google', 'state', 'the-code')

		const [url, init] = fetchMock.mock.calls[0] ?? []

		expect(url).toBe('https://oauth2.googleapis.com/token')

		expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
			client_id: 'google-id',
			client_secret: 'google-secret',
			code: 'the-code',
			code_verifier: 'the-verifier',
			grant_type: 'authorization_code',
			redirect_uri: `${ORIGIN}/auth/oauth/google/callback`,
		})
	})

	it('makes a user for a new Google account with a verified email', async () => {
		googleAnswers({ sub: 'g-1', email: 'Alice@Example.com', email_verified: true })

		const outcome = await completeOAuth('google', 'state', 'code', '203.0.113.1')

		expect(outcome).toEqual({ kind: 'sign_in', userId: USER_ID, returnTo: '/users' })

		expect(oauthRepository.createUserWithIdentity).toHaveBeenCalledWith({
			provider: 'google',
			subject: 'g-1',
			email: 'alice@example.com',
		})

		expect(onSecurityEvent).toHaveBeenCalledWith({
			type: 'registration',
			ip: '203.0.113.1',
			details: { email: 'Alice@Example.com', provider: 'google' },
		})
	})

	it('refuses a new Google account whose email is not verified', async () => {
		googleAnswers({ sub: 'g-1', email: 'alice@example.com', email_verified: false })

		await expect(completeOAuth('google', 'state', 'code')).rejects.toMatchObject({
			code: 'email_unverified',
		})

		expect(oauthRepository.createUserWithIdentity).not.toHaveBeenCalled()
	})

	it('uses only the primary verified email of a GitHub account', async () => {
		oauthRepository.useState.mockResolvedValue({ ...signInState, provider: 'github' })

		githubAnswers([
			{ email: 'other@example.com', primary: false, verified: true },
			{ email: 'alice@example.com', primary: true, verified: true },
		])

		await completeOAuth('github', 'state', 'code')

		expect(oauthRepository.createUserWithIdentity).toHaveBeenCalledWith({
			provider: 'github',
			subject: '42',
			email: 'alice@example.com',
		})
	})

	it('refuses a new GitHub account whose primary email is not verified', async () => {
		oauthRepository.useState.mockResolvedValue({ ...signInState, provider: 'github' })

		githubAnswers([
			{ email: 'alice@example.com', primary: true, verified: false },
			{ email: 'other@example.com', primary: false, verified: true },
		])

		await expect(completeOAuth('github', 'state', 'code')).rejects.toMatchObject({
			code: 'email_unverified',
		})
	})

	it('signs in the user of a known account, whatever its email', async () => {
		oauthRepository.findIdentityUser.mockResolvedValue(USER_ID)

		googleAnswers({ sub: 'g-1', email_verified: false })

		const outcome = await completeOAuth('google', 'state', 'code')

		expect(outcome).toEqual({ kind: 'sign_in', userId: USER_ID, returnTo: '/users' })

		expect(oauthRepository.findIdentityUser).toHaveBeenCalledWith('google', 'g-1')

		expect(oauthRepository.createUserWithIdentity).not.toHaveBeenCalled()
	})

	it('never signs in to an existing account that has the same email', async () => {
		oauthRepository.createUserWithIdentity.mockResolvedValue('email_exists')

		googleAnswers({ sub: 'g-1', email: 'alice@example.com', email_verified: true })

		await expect(completeOAuth('google', 'state', 'code')).rejects.toMatchObject({
			code: 'account_exists',
			linking: false,
		})

		expect(getUserById).not.toHaveBeenCalled()
	})

	it('refuses an inactive user', async () => {
		oauthRepository.findIdentityUser.mockResolvedValue(USER_ID)

		getUserById.mockResolvedValue({ ...user, is_active: false })

		googleAnswers({ sub: 'g-1' })

		await expect(completeOAuth('google', 'state', 'code')).rejects.toMatchObject({
			code: 'account_inactive',
		})
	})

	it.each([
		['the token exchange fails', { 'https://oauth2.googleapis.com/token': { error: 'bad' } }],
		[
			'the account has no subject',
			{
				'https://oauth2.googleapis.com/token': { access_token: 'token' },
				'https://openidconnect.googleapis.com/v1/userinfo': { email: 'alice@example.com' },
			},
		],
	])('fails when %s', async (_case, routes) => {
		providerAnswers(routes)

		await expect(completeOAuth('google', 'state', 'code')).rejects.toBeInstanceOf(OAuthFailure)
	})

	it('fails when the provider cannot be reached', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'))

		await expect(completeOAuth('google', 'state', 'code')).rejects.toMatchObject({
			code: 'oauth_failed',
		})
	})

	describe('connecting an account', () => {
		beforeEach(() => {
			oauthRepository.useState.mockResolvedValue({
				...signInState,
				return_to: '/account',
				user_id: USER_ID,
			})

			googleAnswers({ sub: 'g-1', email: 'alice@example.com', email_verified: true })
		})

		it('gives the account to the user who started it', async () => {
			const outcome = await completeOAuth('google', 'state', 'code')

			expect(outcome).toEqual({ kind: 'linked', userId: USER_ID, returnTo: '/account' })

			expect(oauthRepository.linkIdentity).toHaveBeenCalledWith(USER_ID, {
				provider: 'google',
				subject: 'g-1',
				email: 'alice@example.com',
			})

			expect(oauthRepository.createUserWithIdentity).not.toHaveBeenCalled()
		})

		it.each([
			['in_use', 'identity_in_use'],
			['provider_linked', 'provider_linked'],
		] as const)('reports %s as %s', async (result, code) => {
			oauthRepository.linkIdentity.mockResolvedValue(result)

			await expect(completeOAuth('google', 'state', 'code')).rejects.toMatchObject({
				code,
				linking: true,
			})
		})

		it('marks a provider failure as part of the connect', async () => {
			providerAnswers({})

			await expect(completeOAuth('google', 'state', 'code')).rejects.toMatchObject({
				code: 'oauth_failed',
				linking: true,
			})
		})
	})
})

describe('unlinkIdentity', () => {
	it.each([
		['not_found', 'identity_not_found'],
		['last_sign_in', 'last_sign_in'],
	] as const)('maps %s to %s', async (result, code) => {
		oauthRepository.unlinkIdentity.mockResolvedValue(result)

		await expect(unlinkIdentity(USER_ID, 'github')).rejects.toMatchObject({ code })
	})

	it('removes the identity', async () => {
		await unlinkIdentity(USER_ID, 'github')

		expect(oauthRepository.unlinkIdentity).toHaveBeenCalledWith(USER_ID, 'github')
	})
})
