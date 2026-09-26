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
	mockCreateLoginTicket,
	mockFindLoginTicket,
	mockCompleteLoginTicket,
	mockCreateSecondFactorOptions,
	mockDeleteLoginTicket,
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
	mockCreateLoginTicket: vi.fn(),
	mockFindLoginTicket: vi.fn(),
	mockCompleteLoginTicket: vi.fn(),
	mockCreateSecondFactorOptions: vi.fn(),
	mockDeleteLoginTicket: vi.fn(),
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
		TICKET_TTL_SECONDS: 5 * 60,
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
		createLoginTicket: (...args: unknown[]) => mockCreateLoginTicket(...args),
		findLoginTicket: (...args: unknown[]) => mockFindLoginTicket(...args),
		completeLoginTicket: (...args: unknown[]) => mockCompleteLoginTicket(...args),
		createSecondFactorOptions: (...args: unknown[]) => mockCreateSecondFactorOptions(...args),
		deleteLoginTicket: (...args: unknown[]) => mockDeleteLoginTicket(...args),
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
	user: {
		id: USER_ID,
		email: 'test@example.com',
		is_active: true,
		is_verified: false,
		role: 'user',
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

describe('Auth routes', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		mockAuthenticateUser.mockResolvedValue(USER_ID)

		mockCreateSession.mockResolvedValue({ token: 'new-token', session })

		mockFindSession.mockResolvedValue(session)

		mockGetFactors.mockResolvedValue({ passkeys: 0, totp: false, recovery_codes: 0 })
	})

	describe('POST /auth/login', () => {
		it('starts a session and returns it', async () => {
			const res = await login()

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(session)

			expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, undefined)
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

			expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, 'old-token')
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

		it('holds the sign-in for a second step when the user has one', async () => {
			mockGetFactors.mockResolvedValueOnce({ passkeys: 1, totp: true, recovery_codes: 10 })

			mockCreateLoginTicket.mockResolvedValueOnce('ticket-token')

			const res = await login()

			expect(res.status).toBe(202)

			expect(await res.json()).toEqual({ methods: ['passkey', 'totp', 'recovery_code'] })

			expect(res.headers.get('set-cookie')).toContain('__Host-mfa=ticket-token')

			expect(mockCreateLoginTicket).toHaveBeenCalledWith(USER_ID)

			expect(mockCreateSession).not.toHaveBeenCalled()
		})

		it('ends the ticket of an earlier password step', async () => {
			mockGetFactors.mockResolvedValueOnce({ passkeys: 1, totp: false, recovery_codes: 0 })

			mockCreateLoginTicket.mockResolvedValueOnce('new-ticket')

			const res = await login({ Cookie: '__Host-mfa=old-ticket' })

			expect(mockDeleteLoginTicket).toHaveBeenCalledWith('old-ticket')

			expect(res.headers.get('set-cookie')).toContain('__Host-mfa=new-ticket')
		})

		it('clears a stale ticket cookie when no second step is needed', async () => {
			const res = await login({ Cookie: '__Host-mfa=old-ticket' })

			expect(res.status).toBe(200)

			expect(mockDeleteLoginTicket).toHaveBeenCalledWith('old-ticket')

			expect(res.headers.get('set-cookie')).toMatch(/__Host-mfa=;/)
		})

		it('starts a session when only recovery codes are left over', async () => {
			mockGetFactors.mockResolvedValueOnce({ passkeys: 0, totp: false, recovery_codes: 3 })

			expect((await login()).status).toBe(200)

			expect(mockCreateLoginTicket).not.toHaveBeenCalled()
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
		it('counts a POST under /auth/login, but not the GET or DELETE of a pending sign-in', async () => {
			limited.length = 0

			await app.request('/auth/login/mfa', { headers: { Cookie: '__Host-mfa=ticket-token' } })

			await app.request('/auth/login/mfa', { method: 'DELETE', headers: { Origin: ORIGIN } })

			await app.request('/auth/login/options', { method: 'POST', headers: { Origin: ORIGIN } })

			expect(limited).toEqual(['POST /auth/login/options'])
		})
	})

	describe('GET /auth/login/mfa', () => {
		function pending(headers: Record<string, string> = { Cookie: '__Host-mfa=ticket-token' }) {
			return app.request('/auth/login/mfa', { headers })
		}

		it('returns the methods of a live sign-in, uncached', async () => {
			mockFindLoginTicket.mockResolvedValueOnce(USER_ID)

			mockGetFactors.mockResolvedValueOnce({ passkeys: 0, totp: true, recovery_codes: 2 })

			const res = await pending()

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ methods: ['totp', 'recovery_code'] })

			expect(res.headers.get('cache-control')).toBe('private, no-store')

			expect(mockFindLoginTicket).toHaveBeenCalledWith('ticket-token')
		})

		it('returns 410 without a ticket', async () => {
			expect((await pending({})).status).toBe(410)

			expect(mockFindLoginTicket).not.toHaveBeenCalled()
		})

		it('returns 410 for a spent ticket', async () => {
			mockFindLoginTicket.mockRejectedValueOnce(new AuthError('sign_in_expired', 'Sign in again'))

			expect((await pending()).status).toBe(410)
		})

		it('returns 410 when the user has no second factor left', async () => {
			mockFindLoginTicket.mockResolvedValueOnce(USER_ID)

			expect((await pending()).status).toBe(410)
		})
	})

	describe('DELETE /auth/login/mfa', () => {
		it('ends the ticket and clears its cookie', async () => {
			const res = await app.request('/auth/login/mfa', {
				method: 'DELETE',
				headers: { Origin: ORIGIN, Cookie: '__Host-mfa=ticket-token' },
			})

			expect(res.status).toBe(204)

			expect(mockDeleteLoginTicket).toHaveBeenCalledWith('ticket-token')

			expect(res.headers.get('set-cookie')).toMatch(/__Host-mfa=;/)
		})

		it('answers 204 without a ticket', async () => {
			const res = await app.request('/auth/login/mfa', {
				method: 'DELETE',
				headers: { Origin: ORIGIN },
			})

			expect(res.status).toBe(204)

			expect(mockDeleteLoginTicket).not.toHaveBeenCalled()
		})
	})

	describe('POST /auth/login/mfa/options', () => {
		it("returns passkey options for the ticket's user", async () => {
			mockFindLoginTicket.mockResolvedValueOnce(USER_ID)

			mockCreateSecondFactorOptions.mockResolvedValueOnce({ challenge: 'abc' })

			const res = await app.request('/auth/login/mfa/options', {
				method: 'POST',
				headers: { Origin: ORIGIN, Cookie: '__Host-mfa=ticket-token' },
			})

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ challenge: 'abc' })

			expect(mockFindLoginTicket).toHaveBeenCalledWith('ticket-token')

			expect(mockCreateSecondFactorOptions).toHaveBeenCalledWith(USER_ID)
		})

		it('returns 410 without a ticket', async () => {
			const res = await app.request('/auth/login/mfa/options', {
				method: 'POST',
				headers: { Origin: ORIGIN },
			})

			expect(res.status).toBe(410)

			expect(mockFindLoginTicket).not.toHaveBeenCalled()
		})
	})

	describe('POST /auth/login/mfa', () => {
		function secondStep(body: unknown, headers: Record<string, string> = {}) {
			return app.request('/auth/login/mfa', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: ORIGIN,
					Cookie: '__Host-mfa=ticket-token',
					...headers,
				},
				body: JSON.stringify(body),
			})
		}

		it('starts a session and clears the ticket cookie', async () => {
			mockCompleteLoginTicket.mockResolvedValueOnce(USER_ID)

			const res = await secondStep({ totp: '123456' }, { 'do-connecting-ip': '203.0.113.7' })

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(session)

			expect(mockCompleteLoginTicket).toHaveBeenCalledWith(
				'ticket-token',
				{ totp: '123456' },
				'203.0.113.7',
			)

			const setCookie = res.headers.get('set-cookie') ?? ''

			expect(setCookie).toContain('__Host-session=new-token')

			expect(setCookie).toMatch(/__Host-mfa=;/)
		})

		it('accepts a recovery code', async () => {
			mockCompleteLoginTicket.mockResolvedValueOnce(USER_ID)

			expect((await secondStep({ recovery_code: 'abcde-fghjk' })).status).toBe(200)
		})

		it('returns 401 when the code is not accepted', async () => {
			mockCompleteLoginTicket.mockRejectedValueOnce(
				new AuthError('invalid_credentials', 'That code or passkey was not accepted'),
			)

			expect((await secondStep({ totp: '000000' })).status).toBe(401)

			expect(mockCreateSession).not.toHaveBeenCalled()
		})

		it('returns 410 without a ticket', async () => {
			expect((await secondStep({ totp: '123456' }, { Cookie: '' })).status).toBe(410)

			expect(mockCompleteLoginTicket).not.toHaveBeenCalled()
		})

		it('rejects a body with no proof', async () => {
			expect((await secondStep({ code: '123456' })).status).toBe(400)

			expect(mockCompleteLoginTicket).not.toHaveBeenCalled()
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

		it('starts a session like a password login', async () => {
			mockAuthenticatePasskey.mockResolvedValueOnce(USER_ID)

			const res = await passkeyLogin(cookie('old-token'))

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(session)

			expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, 'old-token')

			expect(res.headers.get('set-cookie')).toContain('__Host-session=new-token')
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
		})
	})

	describe('POST /auth/register', () => {
		it('registers a new user and returns 201', async () => {
			mockRegisterUser.mockResolvedValueOnce({ ...session.user, email: 'new@example.com' })

			const res = await app.request('/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
				body: JSON.stringify({ email: 'new@example.com', password: 'password123' }),
			})

			expect(res.status).toBe(201)

			expect(await res.json()).toEqual({ id: USER_ID, email: 'new@example.com' })
		})

		it('returns 409 when email already exists', async () => {
			mockRegisterUser.mockRejectedValueOnce(
				new AuthError('email_exists', 'Email already registered'),
			)

			const res = await app.request('/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
				body: JSON.stringify({ email: 'existing@example.com', password: 'password123' }),
			})

			expect(res.status).toBe(409)
		})
	})
})
