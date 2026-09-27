import { stubServiceEnv } from 'vali/env'

stubServiceEnv()

const {
	mockAuthenticateUser,
	mockRegisterUser,
	mockCreateSession,
	mockFindSession,
	mockDeleteSession,
	mockDeleteUserSessions,
	mockCreateSignInOptions,
	mockAuthenticatePasskey,
	mockGetFactors,
	mockCreateSecondFactorOptions,
	mockVerifySession,
	mockSendVerificationEmail,
	mockSendAccountExistsEmail,
	mockVerifyEmail,
	mockRequestPasswordReset,
	mockResetPassword,
	mockCheckTurnstile,
	mockRecordActivity,
	mockGetActivity,
} = vi.hoisted(() => ({
	mockAuthenticateUser: vi.fn(),
	mockRegisterUser: vi.fn(),
	mockCreateSession: vi.fn(),
	mockFindSession: vi.fn(),
	mockDeleteSession: vi.fn(),
	mockDeleteUserSessions: vi.fn(),
	mockCreateSignInOptions: vi.fn(),
	mockAuthenticatePasskey: vi.fn(),
	mockGetFactors: vi.fn(),
	mockCreateSecondFactorOptions: vi.fn(),
	mockVerifySession: vi.fn(),
	mockSendVerificationEmail: vi.fn(),
	mockSendAccountExistsEmail: vi.fn(),
	mockVerifyEmail: vi.fn(),
	mockRequestPasswordReset: vi.fn(),
	mockResetPassword: vi.fn(),
	mockCheckTurnstile: vi.fn(),
	mockRecordActivity: vi.fn(),
	mockGetActivity: vi.fn(),
}))

import { AuthError } from '../auth/errors.js'

vi.mock('../auth/index.js', async () => {
	const errors = await vi.importActual<typeof import('../auth/errors.js')>('../auth/errors.js')

	const mfa = await vi.importActual<typeof import('../auth/mfa.js')>('../auth/mfa.js')

	return {
		configure: vi.fn(),
		getConfig: vi.fn(),
		AuthError: errors.AuthError,
		SESSION_TTL_SECONDS: 30 * 24 * 60 * 60,
		secondFactorMethods: mfa.secondFactorMethods,
		authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
		registerUser: (...args: unknown[]) => mockRegisterUser(...args),
		createSession: (...args: unknown[]) => mockCreateSession(...args),
		findSession: (...args: unknown[]) => mockFindSession(...args),
		deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
		deleteUserSessions: (...args: unknown[]) => mockDeleteUserSessions(...args),
		createSignInOptions: (...args: unknown[]) => mockCreateSignInOptions(...args),
		authenticatePasskey: (...args: unknown[]) => mockAuthenticatePasskey(...args),
		getFactors: (...args: unknown[]) => mockGetFactors(...args),
		createSecondFactorOptions: (...args: unknown[]) => mockCreateSecondFactorOptions(...args),
		verifySession: (...args: unknown[]) => mockVerifySession(...args),
		sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
		sendAccountExistsEmail: (...args: unknown[]) => mockSendAccountExistsEmail(...args),
		verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
		requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
		resetPassword: (...args: unknown[]) => mockResetPassword(...args),
		checkTurnstile: (...args: unknown[]) => mockCheckTurnstile(...args),
		turnstileSiteKey: () => 'site-key',
		recordActivity: (...args: unknown[]) => mockRecordActivity(...args),
		getActivity: (...args: unknown[]) => mockGetActivity(...args),
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

vi.mock('../lib/db.js', () => ({
	db: { ping: vi.fn().mockResolvedValue(true) },
}))

import { createBifrostApp } from '../app.js'

const ORIGIN = 'http://localhost:3000'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const session = {
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

// The Midgard app forwards `/auth/*` with its own host in `x-forwarded-host`.
const viaApp = { 'x-forwarded-host': 'localhost:3000' }

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
	return app.request(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...viaApp, ...headers },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
}

const cookie = (token = 'token') => ({ Cookie: `__Host-session=${token}` })

function login(headers: Record<string, string> = {}) {
	return app.request('/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
		body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
	})
}

describe('Auth routes', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		mockAuthenticateUser.mockResolvedValue(USER_ID)

		mockCreateSession.mockResolvedValue({ token: 'new-token', session })

		mockFindSession.mockResolvedValue(session)

		mockGetFactors.mockResolvedValue({ passkeys: 0, totp: false, recovery_codes: 0 })

		mockSendVerificationEmail.mockResolvedValue(undefined)

		mockSendAccountExistsEmail.mockResolvedValue(undefined)

		mockRequestPasswordReset.mockResolvedValue(undefined)
	})

	describe('POST /auth/login', () => {
		it('starts a session and returns it', async () => {
			const res = await login()

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(session)

			expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, {
				replacing: undefined,
				twoStep: false,
			})

			expect(mockRecordActivity).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: USER_ID,
					actorId: USER_ID,
					action: 'signed_in',
					detail: 'password',
				}),
			)
		})

		it('still signs in when the activity fails to record', async () => {
			mockRecordActivity.mockRejectedValueOnce(new Error('database down'))

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

			expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, {
				replacing: 'old-token',
				twoStep: false,
			})
		})

		it('passes the client IP from the edge header to authenticateUser', async () => {
			await login({ 'do-connecting-ip': '203.0.113.7' })

			expect(mockAuthenticateUser).toHaveBeenCalledWith(
				'test@example.com',
				'password123',
				'203.0.113.7',
			)
		})

		it('returns 401 on invalid credentials', async () => {
			mockAuthenticateUser.mockRejectedValueOnce(
				new AuthError('invalid_credentials', 'Incorrect email or password'),
			)

			const res = await login()

			expect(res.status).toBe(401)

			expect(mockCreateSession).not.toHaveBeenCalled()
		})

		it('returns 403 when the account is inactive', async () => {
			mockAuthenticateUser.mockRejectedValueOnce(
				new AuthError('account_inactive', 'Account is inactive'),
			)

			expect((await login()).status).toBe(403)
		})

		it('starts a one-step session when the user has a second factor', async () => {
			mockGetFactors.mockResolvedValueOnce({ passkeys: 1, totp: true, recovery_codes: 10 })

			const res = await login()

			expect(res.status).toBe(200)

			expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, {
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

			expect(mockAuthenticateUser).not.toHaveBeenCalled()
		})
	})

	describe('POST /auth/login/options', () => {
		it('returns the sign-in options', async () => {
			mockCreateSignInOptions.mockResolvedValueOnce({ challenge: 'abc', rpId: 'localhost' })

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
			mockCreateSecondFactorOptions.mockResolvedValueOnce({ challenge: 'abc' })

			const res = await app.request('/auth/session/verify/options', {
				method: 'POST',
				headers: { Origin: ORIGIN, ...cookie() },
			})

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ challenge: 'abc' })

			expect(mockCreateSecondFactorOptions).toHaveBeenCalledWith(USER_ID)
		})

		it('returns 401 without a session', async () => {
			const res = await app.request('/auth/session/verify/options', {
				method: 'POST',
				headers: { Origin: ORIGIN },
			})

			expect(res.status).toBe(401)

			expect(mockCreateSecondFactorOptions).not.toHaveBeenCalled()
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

			expect(mockVerifySession).toHaveBeenCalledWith(session, { totp: '123456' }, '203.0.113.7')
		})

		it('accepts a recovery code', async () => {
			expect((await verify({ recovery_code: 'abcde-fghjk' })).status).toBe(200)
		})

		it('returns 400 when the code is not accepted and keeps the session', async () => {
			mockVerifySession.mockRejectedValueOnce(
				new AuthError('code_rejected', 'That code or passkey was not accepted'),
			)

			const res = await verify({ totp: '000000' })

			expect(res.status).toBe(400)

			expect(res.headers.get('set-cookie')).toBeNull()
		})

		it('returns 410 and clears the cookie when too many tries end the session', async () => {
			mockVerifySession.mockRejectedValueOnce(
				new AuthError('sign_in_expired', 'Too many tries. Sign in again'),
			)

			const res = await verify({ totp: '000000' })

			expect(res.status).toBe(410)

			expect(res.headers.get('set-cookie')).toMatch(/__Host-session=;/)
		})

		it('returns 401 without a session', async () => {
			expect((await verify({ totp: '123456' }, {})).status).toBe(401)

			expect(mockVerifySession).not.toHaveBeenCalled()
		})

		it('rejects a body with no proof', async () => {
			expect((await verify({ code: '123456' })).status).toBe(400)

			expect(mockVerifySession).not.toHaveBeenCalled()
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
			mockAuthenticatePasskey.mockResolvedValueOnce(USER_ID)

			const res = await passkeyLogin(cookie('old-token'))

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(session)

			expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, {
				replacing: 'old-token',
				twoStep: true,
			})

			expect(res.headers.get('set-cookie')).toContain('__Host-session=new-token')

			expect(mockRecordActivity).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'signed_in', detail: 'passkey' }),
			)
		})

		it('passes the credential and the client IP to authenticatePasskey', async () => {
			mockAuthenticatePasskey.mockResolvedValueOnce(USER_ID)

			await passkeyLogin({ 'do-connecting-ip': '203.0.113.7' })

			expect(mockAuthenticatePasskey).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'credential-1' }),
				'203.0.113.7',
			)
		})

		it('returns 401 for an unrecognized passkey', async () => {
			mockAuthenticatePasskey.mockRejectedValueOnce(
				new AuthError('invalid_credentials', 'Passkey not recognized'),
			)

			expect((await passkeyLogin()).status).toBe(401)

			expect(mockCreateSession).not.toHaveBeenCalled()
		})

		it('rejects a body that is not a credential', async () => {
			expect((await passkeyLogin({}, { id: 'credential-1' })).status).toBe(400)

			expect(mockAuthenticatePasskey).not.toHaveBeenCalled()
		})
	})

	describe('GET /auth/session', () => {
		it('returns 401 without a cookie and never looks one up', async () => {
			const res = await app.request('/auth/session')

			expect(res.status).toBe(401)

			expect(mockFindSession).not.toHaveBeenCalled()
		})

		it('returns the live session with its user', async () => {
			const res = await app.request('/auth/session', { headers: cookie() })

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(session)

			expect(res.headers.get('cache-control')).toBe('private, no-store')

			expect(mockFindSession).toHaveBeenCalledWith('token')
		})

		it('returns 401 and clears the cookie when the session is gone', async () => {
			mockFindSession.mockResolvedValueOnce(null)

			const res = await app.request('/auth/session', { headers: cookie() })

			expect(res.status).toBe(401)

			expect(res.headers.get('set-cookie')).toContain('__Host-session=;')
		})
	})

	describe('POST /auth/logout', () => {
		it('deletes the current session and clears the cookie', async () => {
			const res = await app.request('/auth/logout', {
				method: 'POST',
				headers: { ...cookie(), Origin: ORIGIN },
			})

			expect(res.status).toBe(200)

			expect(mockDeleteSession).toHaveBeenCalledWith(session.id)

			expect(res.headers.get('set-cookie')).toContain('__Host-session=;')
		})

		it('clears the cookie even without a session', async () => {
			const res = await app.request('/auth/logout', {
				method: 'POST',
				headers: { Origin: ORIGIN },
			})

			expect(res.status).toBe(200)

			expect(mockDeleteSession).not.toHaveBeenCalled()
		})
	})

	describe('DELETE /auth/sessions', () => {
		it('returns 401 without a session', async () => {
			const res = await app.request('/auth/sessions', {
				method: 'DELETE',
				headers: { Origin: ORIGIN },
			})

			expect(res.status).toBe(401)

			expect(mockDeleteUserSessions).not.toHaveBeenCalled()
		})

		it("deletes the user's other sessions and keeps this one", async () => {
			const res = await app.request('/auth/sessions', {
				method: 'DELETE',
				headers: { ...cookie(), Origin: ORIGIN },
			})

			expect(res.status).toBe(204)

			expect(mockDeleteUserSessions).toHaveBeenCalledWith(USER_ID, session.id)

			expect(mockRecordActivity).toHaveBeenCalledWith(
				expect.objectContaining({ userId: USER_ID, action: 'signed_out_elsewhere' }),
			)
		})
	})

	describe('GET /auth/activity', () => {
		it("returns the signed-in user's recent activity", async () => {
			const entry = {
				id: '00000000-0000-7000-8000-000000000002',
				action: 'signed_in',
				detail: 'password',
				actor_id: USER_ID,
				ip: '203.0.113.9',
				created_at: '2026-09-27T00:00:00.000Z',
			}

			mockGetActivity.mockResolvedValueOnce([entry])

			const res = await app.request('/auth/activity', { headers: cookie() })

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ data: [entry], total: 1 })

			expect(mockGetActivity).toHaveBeenCalledWith(USER_ID)

			expect(res.headers.get('cache-control')).toBe('private, no-store')
		})

		it('returns 401 without a session', async () => {
			const res = await app.request('/auth/activity')

			expect(res.status).toBe(401)

			expect(mockGetActivity).not.toHaveBeenCalled()
		})
	})

	describe('GET /auth/register/options', () => {
		it('returns the Turnstile site key', async () => {
			const res = await app.request('/auth/register/options')

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ turnstile_site_key: 'site-key' })
		})
	})

	describe('POST /auth/register', () => {
		const CHECK_EMAIL = { message: 'Check your email to finish signing up' }

		it('registers a new user and asks them to check their email', async () => {
			mockRegisterUser.mockResolvedValueOnce({ ...session.user, email: 'new@example.com' })

			const res = await post('/auth/register', {
				email: 'new@example.com',
				password: 'password123',
			})

			expect(res.status).toBe(202)

			expect(await res.json()).toEqual(CHECK_EMAIL)
		})

		it('emails a verification link that opens the app', async () => {
			const user = { ...session.user, email: 'new@example.com' }

			mockRegisterUser.mockResolvedValueOnce(user)

			await post('/auth/register', { email: 'new@example.com', password: 'password123' })

			expect(mockSendVerificationEmail).toHaveBeenCalledWith(user, 'http://localhost:3000')

			expect(mockSendAccountExistsEmail).not.toHaveBeenCalled()
		})

		it('answers a taken email the same way and emails its owner', async () => {
			mockRegisterUser.mockResolvedValueOnce(null)

			const res = await post('/auth/register', {
				email: 'existing@example.com',
				password: 'password123',
			})

			expect(res.status).toBe(202)

			expect(await res.json()).toEqual(CHECK_EMAIL)

			expect(mockSendAccountExistsEmail).toHaveBeenCalledWith(
				'existing@example.com',
				'http://localhost:3000',
			)

			expect(mockSendVerificationEmail).not.toHaveBeenCalled()
		})

		it('checks the Turnstile token before making the account', async () => {
			mockCheckTurnstile.mockRejectedValueOnce(new AuthError('turnstile_failed', 'Not human'))

			const res = await post('/auth/register', {
				email: 'new@example.com',
				password: 'password123',
				turnstile_token: 'token',
			})

			expect(res.status).toBe(400)

			expect(mockCheckTurnstile).toHaveBeenCalledWith('token', expect.any(String))

			expect(mockRegisterUser).not.toHaveBeenCalled()
		})

		it('still answers when the email fails', async () => {
			mockRegisterUser.mockResolvedValueOnce(session.user)

			mockSendVerificationEmail.mockRejectedValueOnce(new Error('mail down'))

			const res = await post('/auth/register', {
				email: 'test@example.com',
				password: 'password123',
			})

			expect(res.status).toBe(202)
		})
	})

	describe('POST /auth/verify-email', () => {
		it('emails the signed-in user a link', async () => {
			const res = await post('/auth/verify-email', undefined, cookie())

			expect(res.status).toBe(204)

			expect(mockSendVerificationEmail).toHaveBeenCalledWith(session.user, 'http://localhost:3000')
		})

		it('returns 409 when the email is verified', async () => {
			mockFindSession.mockResolvedValue({
				...session,
				user: { ...session.user, is_verified: true },
			})

			const res = await post('/auth/verify-email', undefined, cookie())

			expect(res.status).toBe(409)

			expect(mockSendVerificationEmail).not.toHaveBeenCalled()
		})

		it('returns 429 within a minute of the last link', async () => {
			mockSendVerificationEmail.mockRejectedValueOnce(
				new AuthError('email_recently_sent', 'We just sent you an email'),
			)

			const res = await post('/auth/verify-email', undefined, cookie())

			expect(res.status).toBe(429)
		})

		it('returns 400 for an unknown app', async () => {
			const res = await post('/auth/verify-email', undefined, {
				...cookie(),
				'x-forwarded-host': 'evil.example',
			})

			expect(res.status).toBe(400)

			expect(mockSendVerificationEmail).not.toHaveBeenCalled()
		})

		it('returns 401 without a session', async () => {
			const res = await post('/auth/verify-email')

			expect(res.status).toBe(401)
		})
	})

	describe('POST /auth/verify-email/confirm', () => {
		it('verifies the email of the link', async () => {
			mockVerifyEmail.mockResolvedValueOnce(USER_ID)

			const res = await post('/auth/verify-email/confirm', { token: 'abc' })

			expect(res.status).toBe(204)

			expect(mockVerifyEmail).toHaveBeenCalledWith('abc')

			expect(mockRecordActivity).toHaveBeenCalledWith(
				expect.objectContaining({ userId: USER_ID, action: 'email_verified' }),
			)
		})

		it('returns 400 for an expired link', async () => {
			mockVerifyEmail.mockRejectedValueOnce(new AuthError('link_expired', 'Expired'))

			const res = await post('/auth/verify-email/confirm', { token: 'abc' })

			expect(res.status).toBe(400)
		})
	})

	describe('POST /auth/reset-password', () => {
		it('answers 202 and asks for a link on the app', async () => {
			const res = await post('/auth/reset-password', { email: 'test@example.com' })

			expect(res.status).toBe(202)

			expect(mockRequestPasswordReset).toHaveBeenCalledWith(
				'test@example.com',
				'http://localhost:3000',
			)
		})

		it('answers the same when sending fails', async () => {
			mockRequestPasswordReset.mockRejectedValueOnce(new Error('mail down'))

			const res = await post('/auth/reset-password', { email: 'test@example.com' })

			expect(res.status).toBe(202)
		})

		it('returns 400 for an unknown app', async () => {
			const res = await post(
				'/auth/reset-password',
				{ email: 'test@example.com' },
				{ 'x-forwarded-host': 'evil.example' },
			)

			expect(res.status).toBe(400)

			expect(mockRequestPasswordReset).not.toHaveBeenCalled()
		})
	})

	describe('POST /auth/reset-password/confirm', () => {
		it('sets the new password', async () => {
			mockResetPassword.mockResolvedValueOnce(USER_ID)

			const res = await post('/auth/reset-password/confirm', {
				token: 'abc',
				password: 'new password',
			})

			expect(res.status).toBe(204)

			expect(mockResetPassword).toHaveBeenCalledWith('abc', 'new password')

			expect(mockRecordActivity).toHaveBeenCalledWith(
				expect.objectContaining({ userId: USER_ID, action: 'password_reset' }),
			)
		})

		it('rejects a weak password', async () => {
			const res = await post('/auth/reset-password/confirm', { token: 'abc', password: 'x' })

			expect(res.status).toBe(400)

			expect(mockResetPassword).not.toHaveBeenCalled()
		})

		it('returns 400 for an expired link', async () => {
			mockResetPassword.mockRejectedValueOnce(new AuthError('link_expired', 'Expired'))

			const res = await post('/auth/reset-password/confirm', {
				token: 'abc',
				password: 'new password',
			})

			expect(res.status).toBe(400)
		})
	})

	describe('email rate limits', () => {
		it('counts requests that send email or set a password', async () => {
			limited.length = 0

			await post('/auth/verify-email')

			await post('/auth/reset-password', { email: 'test@example.com' })

			await post('/auth/reset-password/confirm', { token: 'abc', password: 'new password' })

			await post('/auth/verify-email/confirm', { token: 'abc' })

			expect(limited).toEqual([
				'POST /auth/verify-email',
				'POST /auth/reset-password',
				'POST /auth/reset-password/confirm',
			])
		})
	})
})
