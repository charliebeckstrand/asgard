const { env } = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }))

vi.mock('../../lib/env.js', () => ({ environment: () => env }))

vi.mock('../../lib/repositories.js')

vi.mock('vidar/client')

import { createHash } from 'node:crypto'
import type { User } from 'skuld'
import { reportEvent } from 'vidar/client'
import type { Mock } from 'vitest'
import type { StoredOAuthState } from '../../lib/oauth-repository.js'
import * as repositories from '../../lib/repositories.js'
import {
	completeOAuth,
	enabledProviders,
	OAuthFailure,
	safeReturnTo,
	startOAuth,
	unlinkIdentity,
} from '../oauth.js'
import { hashToken } from '../sessions.js'

const IP = '203.0.113.1'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const ORIGIN = 'https://admin.ivoryimage.dev'

const user: User = {
	id: USER_ID,
	email: 'alice@example.com',
	name: null,
	is_active: true,
	is_verified: true,
	roles: ['user'],
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

const oauthRepository = vi.mocked(repositories.oauthRepository)

const getUserById = vi.mocked(repositories.userRepository.getUserById)

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

	Object.assign(env, {
		OAUTH_GOOGLE_CLIENT_ID: 'google-id',
		OAUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
		OAUTH_GITHUB_CLIENT_ID: 'github-id',
		OAUTH_GITHUB_CLIENT_SECRET: 'github-secret',
	})

	oauthRepository.useState.mockResolvedValue(signInState)

	oauthRepository.findIdentityUser.mockResolvedValue(null)

	oauthRepository.createUserWithIdentity.mockResolvedValue({ userId: USER_ID })

	oauthRepository.linkIdentity.mockResolvedValue('linked')

	oauthRepository.unlinkIdentity.mockResolvedValue('deleted')

	getUserById.mockResolvedValue(user)

	fetchMock = vi.fn()

	vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('enabledProviders', () => {
	it('lists only the providers with a client', () => {
		env.OAUTH_GITHUB_CLIENT_ID = undefined

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
		['/\t/evil.example', '/'],
		['/\n/evil.example', '/'],
		['\\/evil.example', '/'],
		['/%09/evil.example', '/%09/evil.example'],
		['/account#passkeys', '/account#passkeys'],
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
		env.OAUTH_GOOGLE_CLIENT_SECRET = undefined

		await expect(startOAuth('google', { origin: ORIGIN, returnTo: '/' })).rejects.toMatchObject({
			code: 'oauth_unavailable',
		})

		expect(oauthRepository.createState).not.toHaveBeenCalled()
	})
})

describe('completeOAuth', () => {
	it('fails without a live state for the provider', async () => {
		oauthRepository.useState.mockResolvedValue(null)

		await expect(completeOAuth('google', 'state', 'code', IP)).rejects.toMatchObject({
			code: 'oauth_failed',
		})

		oauthRepository.useState.mockResolvedValue({ ...signInState, provider: 'github' })

		await expect(completeOAuth('google', 'state', 'code', IP)).rejects.toMatchObject({
			code: 'oauth_failed',
		})

		expect(oauthRepository.useState).toHaveBeenCalledWith(hashToken('state'))

		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('trades the code with the verifier and the same redirect URI', async () => {
		googleAnswers({ sub: 'g-1', email: 'alice@example.com', email_verified: true })

		await completeOAuth('google', 'state', 'the-code', IP)

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

		expect(reportEvent).toHaveBeenCalledWith(
			'registration',
			'203.0.113.1',
			{ email: 'Alice@Example.com', provider: 'google' },
			'bifrost',
		)
	})

	it('refuses a new Google account whose email is not verified', async () => {
		googleAnswers({ sub: 'g-1', email: 'alice@example.com', email_verified: false })

		await expect(completeOAuth('google', 'state', 'code', IP)).rejects.toMatchObject({
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

		await completeOAuth('github', 'state', 'code', IP)

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

		await expect(completeOAuth('github', 'state', 'code', IP)).rejects.toMatchObject({
			code: 'email_unverified',
		})
	})

	it('signs in the user of a known account, whatever its email', async () => {
		oauthRepository.findIdentityUser.mockResolvedValue(USER_ID)

		googleAnswers({ sub: 'g-1', email_verified: false })

		const outcome = await completeOAuth('google', 'state', 'code', IP)

		expect(outcome).toEqual({ kind: 'sign_in', userId: USER_ID, returnTo: '/users' })

		expect(oauthRepository.findIdentityUser).toHaveBeenCalledWith('google', 'g-1')

		expect(oauthRepository.createUserWithIdentity).not.toHaveBeenCalled()
	})

	it('never signs in to an existing account that has the same email', async () => {
		oauthRepository.createUserWithIdentity.mockResolvedValue('email_exists')

		googleAnswers({ sub: 'g-1', email: 'alice@example.com', email_verified: true })

		await expect(completeOAuth('google', 'state', 'code', IP)).rejects.toMatchObject({
			code: 'account_exists',
			linking: false,
		})

		expect(getUserById).not.toHaveBeenCalled()
	})

	it('refuses an inactive user', async () => {
		oauthRepository.findIdentityUser.mockResolvedValue(USER_ID)

		getUserById.mockResolvedValue({ ...user, is_active: false })

		googleAnswers({ sub: 'g-1' })

		await expect(completeOAuth('google', 'state', 'code', IP)).rejects.toMatchObject({
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

		await expect(completeOAuth('google', 'state', 'code', IP)).rejects.toBeInstanceOf(OAuthFailure)
	})

	it('fails when the provider cannot be reached', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'))

		await expect(completeOAuth('google', 'state', 'code', IP)).rejects.toMatchObject({
			code: 'oauth_failed',
		})
	})

	it('fails when the provider answers with something other than JSON', async () => {
		fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 200 }))

		await expect(completeOAuth('google', 'state', 'code', IP)).rejects.toMatchObject({
			code: 'oauth_failed',
		})
	})

	it('gives up on a provider that does not answer', async () => {
		googleAnswers({ sub: 'g-1', email: 'alice@example.com', email_verified: true })

		await completeOAuth('google', 'state', 'code', IP)

		for (const [, init] of fetchMock.mock.calls) {
			expect(init?.signal).toBeInstanceOf(AbortSignal)
		}
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
			const outcome = await completeOAuth('google', 'state', 'code', IP)

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

			await expect(completeOAuth('google', 'state', 'code', IP)).rejects.toMatchObject({
				code,
				linking: true,
			})
		})

		it('marks a provider failure as part of the connect', async () => {
			providerAnswers({})

			await expect(completeOAuth('google', 'state', 'code', IP)).rejects.toMatchObject({
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
