import { stubServiceEnv } from 'vali/env'

stubServiceEnv()

vi.mock('../../auth/index.js', { spy: true })

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

import type { Session } from 'skuld'
import { createBifrostApp } from '../../app.js'
import { AuthError } from '../../auth/errors.js'
import * as auth from '../../auth/index.js'

const ORIGIN = 'http://localhost:3000'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const session: Session = {
	id: 'session-hash',
	created_at: '2026-09-26T00:00:00.000Z',
	expires_at: '2026-10-26T00:00:00.000Z',
	two_step: false,
	user: {
		id: USER_ID,
		email: 'test@example.com',
		is_active: true,
		is_verified: false,
		roles: ['user'],
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
	},
}

const app = createBifrostApp()

const cookie = (token = 'token') => ({ Cookie: `__Host-session=${token}` })

function login(headers: Record<string, string> = {}) {
	return app.request('/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
		body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
	})
}

describe('Sign-in routes', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		vi.mocked(auth.authenticateUser).mockResolvedValue(USER_ID)

		vi.mocked(auth.createSession).mockResolvedValue({ token: 'new-token', session })

		vi.mocked(auth.findSession).mockResolvedValue(session)

		vi.mocked(auth.createSignInOptions).mockResolvedValue({ challenge: 'abc' })

		vi.mocked(auth.verifySession).mockResolvedValue()

		vi.mocked(auth.recordActivity).mockResolvedValue()
	})

	describe('POST /auth/login', () => {
		it('starts a session and returns it', async () => {
			const res = await login()

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(session)

			expect(auth.createSession).toHaveBeenCalledWith(USER_ID, {
				replacing: undefined,
				twoStep: false,
			})

			expect(auth.recordActivity).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: USER_ID,
					actorId: USER_ID,
					action: 'signed_in',
					detail: 'password',
				}),
			)
		})

		it('still signs in when the activity fails to record', async () => {
			vi.mocked(auth.recordActivity).mockRejectedValueOnce(new Error('database down'))

			expect((await login()).status).toBe(200)
		})

		it('sets the token in a __Host- cookie', async () => {
			const setCookie = (await login()).headers.get('set-cookie') ?? ''

			expect(setCookie).toContain('__Host-session=new-token')

			expect(setCookie).toContain('HttpOnly')

			expect(setCookie).toContain('Secure')

			expect(setCookie).toContain('SameSite=Lax')

			expect(setCookie).toContain('Path=/')

			expect(setCookie).not.toContain('Domain')
		})

		it('replaces the session the browser still holds', async () => {
			await login(cookie('old-token'))

			expect(auth.createSession).toHaveBeenCalledWith(USER_ID, {
				replacing: 'old-token',
				twoStep: false,
			})
		})

		it('passes the client IP from the edge header to authenticateUser', async () => {
			await login({ 'do-connecting-ip': '203.0.113.7' })

			expect(auth.authenticateUser).toHaveBeenCalledWith(
				'test@example.com',
				'password123',
				'203.0.113.7',
			)
		})

		it('returns 401 on invalid credentials', async () => {
			vi.mocked(auth.authenticateUser).mockRejectedValueOnce(
				new AuthError('invalid_credentials', 'Incorrect email or password'),
			)

			const res = await login()

			expect(res.status).toBe(401)

			expect(auth.createSession).not.toHaveBeenCalled()
		})

		it('returns 403 when the account is inactive', async () => {
			vi.mocked(auth.authenticateUser).mockRejectedValueOnce(
				new AuthError('account_inactive', 'Account is inactive'),
			)

			expect((await login()).status).toBe(403)
		})

		it('starts a one-step session when the user has a second factor', async () => {
			vi.mocked(auth.getFactors).mockResolvedValueOnce({
				passkeys: 1,
				totp: true,
				recovery_codes: 10,
			})

			const res = await login()

			expect(res.status).toBe(200)

			expect(auth.createSession).toHaveBeenCalledWith(USER_ID, {
				replacing: undefined,
				twoStep: false,
			})
		})

		it('rejects a password longer than 128 characters', async () => {
			const res = await app.request('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
				body: JSON.stringify({ email: 'test@example.com', password: 'x'.repeat(129) }),
			})

			expect(res.status).toBe(400)

			expect(auth.authenticateUser).not.toHaveBeenCalled()
		})
	})

	describe('POST /auth/login/options', () => {
		it('returns the sign-in options', async () => {
			vi.mocked(auth.createSignInOptions).mockResolvedValueOnce({
				challenge: 'abc',
				rpId: 'localhost',
			})

			const res = await app.request('/auth/login/options', {
				method: 'POST',
				headers: { Origin: ORIGIN },
			})

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ challenge: 'abc', rpId: 'localhost' })
		})
	})

	describe('login rate limit', () => {
		it('counts sign-ins and second steps', async () => {
			limited.length = 0

			await app.request('/auth/login/options', { method: 'POST', headers: { Origin: ORIGIN } })

			await app.request('/auth/session/verify', { method: 'POST', headers: { Origin: ORIGIN } })

			await app.request('/auth/session/verify/options', {
				method: 'POST',
				headers: { Origin: ORIGIN },
			})

			await app.request('/auth/session', { headers: cookie() })

			expect(limited).toEqual([
				'POST /auth/login/options',
				'POST /auth/session/verify',
				'POST /auth/session/verify/options',
			])
		})
	})

	describe('POST /auth/session/verify/options', () => {
		it('returns passkey options for the signed-in user', async () => {
			vi.mocked(auth.createSecondFactorOptions).mockResolvedValueOnce({ challenge: 'abc' })

			const res = await app.request('/auth/session/verify/options', {
				method: 'POST',
				headers: { Origin: ORIGIN, ...cookie() },
			})

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ challenge: 'abc' })

			expect(auth.createSecondFactorOptions).toHaveBeenCalledWith(USER_ID)
		})

		it('returns 401 without a session', async () => {
			const res = await app.request('/auth/session/verify/options', {
				method: 'POST',
				headers: { Origin: ORIGIN },
			})

			expect(res.status).toBe(401)

			expect(auth.createSecondFactorOptions).not.toHaveBeenCalled()
		})
	})

	describe('POST /auth/session/verify', () => {
		function verify(body: unknown, headers: Record<string, string> = cookie()) {
			return app.request('/auth/session/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
				body: JSON.stringify(body),
			})
		}

		it('passes the second step and returns the session', async () => {
			const res = await verify(
				{ totp: '123456' },
				{ ...cookie(), 'do-connecting-ip': '203.0.113.7' },
			)

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ ...session, two_step: true })

			expect(auth.verifySession).toHaveBeenCalledWith(session, { totp: '123456' }, '203.0.113.7')
		})

		it('accepts a recovery code', async () => {
			expect((await verify({ recovery_code: 'abcde-fghjk' })).status).toBe(200)
		})

		it('returns 400 when the code is not accepted and keeps the session', async () => {
			vi.mocked(auth.verifySession).mockRejectedValueOnce(
				new AuthError('code_rejected', 'That code or passkey was not accepted'),
			)

			const res = await verify({ totp: '000000' })

			expect(res.status).toBe(400)

			expect(res.headers.get('set-cookie')).toBeNull()
		})

		it('returns 410 and clears the cookie when too many tries end the session', async () => {
			vi.mocked(auth.verifySession).mockRejectedValueOnce(
				new AuthError('sign_in_expired', 'Too many tries. Sign in again'),
			)

			const res = await verify({ totp: '000000' })

			expect(res.status).toBe(410)

			expect(res.headers.get('set-cookie')).toMatch(/__Host-session=;/)
		})

		it('returns 401 without a session', async () => {
			expect((await verify({ totp: '123456' }, {})).status).toBe(401)

			expect(auth.verifySession).not.toHaveBeenCalled()
		})

		it('rejects a body with no proof', async () => {
			expect((await verify({ code: '123456' })).status).toBe(400)

			expect(auth.verifySession).not.toHaveBeenCalled()
		})
	})

	describe('POST /auth/login/passkey', () => {
		const credential = {
			id: 'credential-1',
			rawId: 'credential-1',
			type: 'public-key',
			response: { clientDataJSON: 'x', authenticatorData: 'y', signature: 'z' },
			clientExtensionResults: {},
		}

		function passkeyLogin(headers: Record<string, string> = {}, body: unknown = credential) {
			return app.request('/auth/login/passkey', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
				body: JSON.stringify(body),
			})
		}

		it('starts a session past its second step', async () => {
			vi.mocked(auth.authenticatePasskey).mockResolvedValueOnce(USER_ID)

			const res = await passkeyLogin(cookie('old-token'))

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(session)

			expect(auth.createSession).toHaveBeenCalledWith(USER_ID, {
				replacing: 'old-token',
				twoStep: true,
			})

			expect(res.headers.get('set-cookie')).toContain('__Host-session=new-token')

			expect(auth.recordActivity).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'signed_in', detail: 'passkey' }),
			)
		})

		it('passes the credential and the client IP to authenticatePasskey', async () => {
			vi.mocked(auth.authenticatePasskey).mockResolvedValueOnce(USER_ID)

			await passkeyLogin({ 'do-connecting-ip': '203.0.113.7' })

			expect(auth.authenticatePasskey).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'credential-1' }),
				'203.0.113.7',
			)
		})

		it('returns 401 for an unrecognized passkey', async () => {
			vi.mocked(auth.authenticatePasskey).mockRejectedValueOnce(
				new AuthError('invalid_credentials', 'Passkey not recognized'),
			)

			expect((await passkeyLogin()).status).toBe(401)

			expect(auth.createSession).not.toHaveBeenCalled()
		})

		it('rejects a body that is not a credential', async () => {
			expect((await passkeyLogin({}, { id: 'credential-1' })).status).toBe(400)

			expect(auth.authenticatePasskey).not.toHaveBeenCalled()
		})
	})
})
