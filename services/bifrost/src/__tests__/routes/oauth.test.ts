import { stubServiceEnv } from 'vali/env'

stubServiceEnv()

const {
	mockFindSession,
	mockStartOAuth,
	mockCompleteOAuth,
	mockGetFactors,
	mockCreateLoginTicket,
	mockDeleteLoginTicket,
	mockCreateSession,
	mockEnabledProviders,
	mockGetIdentities,
	mockUnlinkIdentity,
} = vi.hoisted(() => ({
	mockFindSession: vi.fn(),
	mockStartOAuth: vi.fn(),
	mockCompleteOAuth: vi.fn(),
	mockGetFactors: vi.fn(),
	mockCreateLoginTicket: vi.fn(),
	mockDeleteLoginTicket: vi.fn(),
	mockCreateSession: vi.fn(),
	mockEnabledProviders: vi.fn(),
	mockGetIdentities: vi.fn(),
	mockUnlinkIdentity: vi.fn(),
}))

vi.mock('../../auth/index.js', async () => {
	const errors =
		await vi.importActual<typeof import('../../auth/errors.js')>('../../auth/errors.js')

	const mfa = await vi.importActual<typeof import('../../auth/mfa.js')>('../../auth/mfa.js')

	const oauth = await vi.importActual<typeof import('../../auth/oauth.js')>('../../auth/oauth.js')

	const sessions =
		await vi.importActual<typeof import('../../auth/sessions.js')>('../../auth/sessions.js')

	return {
		configure: vi.fn(),
		getConfig: vi.fn(),
		AuthError: errors.AuthError,
		OAuthFailure: oauth.OAuthFailure,
		safeReturnTo: oauth.safeReturnTo,
		requireRecentSignIn: sessions.requireRecentSignIn,
		secondFactorMethods: mfa.secondFactorMethods,
		SESSION_TTL_SECONDS: 30 * 24 * 60 * 60,
		TICKET_TTL_SECONDS: 5 * 60,
		findSession: (...args: unknown[]) => mockFindSession(...args),
		startOAuth: (...args: unknown[]) => mockStartOAuth(...args),
		completeOAuth: (...args: unknown[]) => mockCompleteOAuth(...args),
		getFactors: (...args: unknown[]) => mockGetFactors(...args),
		createLoginTicket: (...args: unknown[]) => mockCreateLoginTicket(...args),
		deleteLoginTicket: (...args: unknown[]) => mockDeleteLoginTicket(...args),
		createSession: (...args: unknown[]) => mockCreateSession(...args),
		enabledProviders: (...args: unknown[]) => mockEnabledProviders(...args),
		getIdentities: (...args: unknown[]) => mockGetIdentities(...args),
		unlinkIdentity: (...args: unknown[]) => mockUnlinkIdentity(...args),
	}
})

// Records each request that a rate limit sees, then lets it through.
const { limited } = vi.hoisted(() => ({ limited: [] as string[] }))

vi.mock('vidar/client', () => ({
	configure: vi.fn(),
	createVidar: vi
		.fn()
		.mockReturnValue(
			async (c: { req: { method: string; path: string } }, next: () => Promise<void>) => {
				limited.push(`${c.req.method} ${c.req.path}`)

				await next()
			},
		),
	reportEvent: vi.fn(),
}))

vi.mock('../../lib/db.js', () => ({
	db: { ping: vi.fn().mockResolvedValue(true) },
}))

import { createBifrostApp } from '../../app.js'
import { AuthError } from '../../auth/errors.js'
import { OAuthFailure } from '../../auth/oauth.js'

const ORIGIN = 'http://localhost:3000'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const app = createBifrostApp()

// The Midgard app forwards `/auth/*` with its own host in `x-forwarded-host`.
const viaApp = { 'x-forwarded-host': 'localhost:3000' }

function signedIn(createdAt = new Date().toISOString()) {
	mockFindSession.mockResolvedValue({
		id: 'session-hash',
		created_at: createdAt,
		expires_at: '2099-01-01T00:00:00.000Z',
		user: {
			id: USER_ID,
			email: 'alice@example.com',
			is_active: true,
			is_verified: true,
			role: 'user',
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
		},
	})
}

function callback(query: string, cookie = '__Host-oauth=the-state') {
	return app.request(`/auth/oauth/google/callback?${query}`, {
		headers: { ...viaApp, Cookie: cookie },
	})
}

function cookies(res: Response): string[] {
	return res.headers.getSetCookie()
}

describe('OAuth routes', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		limited.length = 0

		mockFindSession.mockResolvedValue(null)

		mockStartOAuth.mockResolvedValue({
			state: 'the-state',
			url: 'https://accounts.google.com/o/oauth2/v2/auth?state=the-state',
		})

		mockCompleteOAuth.mockResolvedValue({ kind: 'sign_in', userId: USER_ID, returnTo: '/users' })

		mockGetFactors.mockResolvedValue({ passkeys: 0, totp: false, recovery_codes: 0 })

		mockCreateSession.mockResolvedValue({ token: 'session-token', session: {} })

		mockCreateLoginTicket.mockResolvedValue('ticket-token')
	})

	describe('GET /auth/oauth/providers', () => {
		it('lists the providers set up', async () => {
			mockEnabledProviders.mockReturnValue(['github'])

			const res = await app.request('/auth/oauth/providers')

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ providers: ['github'] })
		})
	})

	describe('GET /auth/oauth/:provider/start', () => {
		it('goes to the provider with the state in a cookie', async () => {
			const res = await app.request('/auth/oauth/google/start?return_to=/users', {
				headers: viaApp,
			})

			expect(res.status).toBe(302)

			expect(res.headers.get('Location')).toBe(
				'https://accounts.google.com/o/oauth2/v2/auth?state=the-state',
			)

			expect(mockStartOAuth).toHaveBeenCalledWith('google', {
				origin: ORIGIN,
				returnTo: '/users',
				linkUserId: undefined,
			})

			const [stateCookie] = cookies(res)

			expect(stateCookie).toContain('__Host-oauth=the-state')

			expect(stateCookie).toContain('HttpOnly')

			expect(stateCookie).toContain('SameSite=Lax')

			expect(limited).toContain('GET /auth/oauth/google/start')
		})

		it('never returns to another site', async () => {
			await app.request('/auth/oauth/google/start?return_to=//evil.example', { headers: viaApp })

			expect(mockStartOAuth.mock.calls[0]?.[1]).toMatchObject({ returnTo: '/' })
		})

		it('refuses a host that is not one of the apps', async () => {
			const res = await app.request('/auth/oauth/google/start', {
				headers: { 'x-forwarded-host': 'evil.example' },
			})

			expect(res.status).toBe(400)

			expect(mockStartOAuth).not.toHaveBeenCalled()
		})

		it('answers 404 for an unknown provider', async () => {
			const res = await app.request('/auth/oauth/gitlab/start', { headers: viaApp })

			expect(res.status).toBe(404)
		})

		it('goes back to sign-in when the provider is not set up', async () => {
			mockStartOAuth.mockRejectedValue(new AuthError('oauth_unavailable', 'Not set up'))

			const res = await app.request('/auth/oauth/google/start', { headers: viaApp })

			expect(res.headers.get('Location')).toBe('/login?error=oauth_unavailable')
		})

		describe('with link=1', () => {
			it('binds the sign-in to the signed-in user', async () => {
				signedIn()

				await app.request('/auth/oauth/google/start?link=1', {
					headers: { ...viaApp, Cookie: '__Host-session=token' },
				})

				expect(mockStartOAuth).toHaveBeenCalledWith('google', {
					origin: ORIGIN,
					returnTo: '/account',
					linkUserId: USER_ID,
				})
			})

			it('goes to sign-in without a session', async () => {
				const res = await app.request('/auth/oauth/google/start?link=1', { headers: viaApp })

				expect(res.headers.get('Location')).toBe('/login')

				expect(mockStartOAuth).not.toHaveBeenCalled()
			})

			it('asks for a recent sign-in', async () => {
				signedIn('2026-01-01T00:00:00.000Z')

				const res = await app.request('/auth/oauth/google/start?link=1', {
					headers: { ...viaApp, Cookie: '__Host-session=token' },
				})

				expect(res.headers.get('Location')).toBe('/account?error=sign_in_again')

				expect(mockStartOAuth).not.toHaveBeenCalled()
			})
		})
	})

	describe('GET /auth/oauth/:provider/callback', () => {
		it('starts a session and goes to the return path', async () => {
			const res = await callback('code=the-code&state=the-state')

			expect(res.status).toBe(302)

			expect(res.headers.get('Location')).toBe('/users')

			expect(mockCompleteOAuth).toHaveBeenCalledWith('google', 'the-state', 'the-code', 'unknown')

			expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, undefined)

			expect(cookies(res).some((c) => c.startsWith('__Host-session=session-token'))).toBe(true)

			expect(cookies(res).some((c) => c.startsWith('__Host-oauth=;'))).toBe(true)

			expect(limited).toContain('GET /auth/oauth/google/callback')
		})

		it('holds the sign-in for its second step when the user has one', async () => {
			mockGetFactors.mockResolvedValue({ passkeys: 1, totp: false, recovery_codes: 0 })

			const res = await callback('code=the-code&state=the-state')

			expect(res.headers.get('Location')).toBe('/login/verify')

			expect(mockCreateSession).not.toHaveBeenCalled()

			expect(cookies(res).some((c) => c.startsWith('__Host-mfa=ticket-token'))).toBe(true)
		})

		it('ends an earlier ticket of the browser', async () => {
			await callback('code=the-code&state=the-state', '__Host-oauth=the-state; __Host-mfa=earlier')

			expect(mockDeleteLoginTicket).toHaveBeenCalledWith('earlier')
		})

		it('goes to the return path after connecting an account', async () => {
			mockCompleteOAuth.mockResolvedValue({ kind: 'linked', userId: USER_ID, returnTo: '/account' })

			const res = await callback('code=the-code&state=the-state')

			expect(res.headers.get('Location')).toBe('/account')

			expect(mockCreateSession).not.toHaveBeenCalled()
		})

		it.each([
			['a state that differs from the cookie', 'code=c&state=other', '__Host-oauth=the-state'],
			['no state cookie', 'code=c&state=the-state', ''],
			['a cancel at the provider', 'error=access_denied&state=the-state', undefined],
		])('refuses %s', async (_case, query, cookie) => {
			const res = await callback(query, cookie)

			expect(res.headers.get('Location')).toBe('/login?error=oauth_failed')

			expect(mockCompleteOAuth).not.toHaveBeenCalled()
		})

		it.each([
			[new OAuthFailure('account_exists', 'Exists'), '/login?error=account_exists'],
			[new OAuthFailure('identity_in_use', 'In use', true), '/account?error=identity_in_use'],
			[new Error('boom'), '/login?error=oauth_failed'],
		])('sends a failure back with its code', async (err, location) => {
			mockCompleteOAuth.mockRejectedValue(err)

			const res = await callback('code=the-code&state=the-state')

			expect(res.headers.get('Location')).toBe(location)

			expect(mockCreateSession).not.toHaveBeenCalled()
		})
	})

	describe('connected accounts', () => {
		const headers = { Cookie: '__Host-session=token', Origin: ORIGIN }

		it('lists the accounts of the signed-in user', async () => {
			signedIn()

			const identities = [
				{ provider: 'github', email: 'alice@example.com', created_at: '2026-09-26T00:00:00Z' },
			]

			mockGetIdentities.mockResolvedValue(identities)

			const res = await app.request('/auth/oauth/identities', { headers })

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ identities })

			expect(mockGetIdentities).toHaveBeenCalledWith(USER_ID)
		})

		it('needs a session', async () => {
			const res = await app.request('/auth/oauth/identities')

			expect(res.status).toBe(401)
		})

		it('disconnects an account after a recent sign-in', async () => {
			signedIn()

			const res = await app.request('/auth/oauth/identities/github', {
				method: 'DELETE',
				headers,
			})

			expect(res.status).toBe(204)

			expect(mockUnlinkIdentity).toHaveBeenCalledWith(USER_ID, 'github')
		})

		it('asks for a recent sign-in to disconnect', async () => {
			signedIn('2026-01-01T00:00:00.000Z')

			const res = await app.request('/auth/oauth/identities/github', {
				method: 'DELETE',
				headers,
			})

			expect(res.status).toBe(403)

			expect(mockUnlinkIdentity).not.toHaveBeenCalled()
		})

		it('keeps the last way to sign in', async () => {
			signedIn()

			mockUnlinkIdentity.mockRejectedValue(new AuthError('last_sign_in', 'Keep one'))

			const res = await app.request('/auth/oauth/identities/github', {
				method: 'DELETE',
				headers,
			})

			expect(res.status).toBe(409)
		})
	})
})
