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

// The Midgard app forwards `/auth/*` with its own host in `x-forwarded-host`.
const viaApp = { 'x-forwarded-host': 'localhost:3000' }

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
	return app.request(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...viaApp, ...headers },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
}

describe('Email routes', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		vi.mocked(auth.findSession).mockResolvedValue(session)

		vi.mocked(auth.checkTurnstile).mockResolvedValue()

		vi.mocked(auth.sendVerificationEmail).mockResolvedValue()

		vi.mocked(auth.sendAccountExistsEmail).mockResolvedValue()

		vi.mocked(auth.requestPasswordReset).mockResolvedValue()

		vi.mocked(auth.recordActivity).mockResolvedValue()
	})

	describe('GET /auth/register/options', () => {
		it('returns the Turnstile site key', async () => {
			vi.mocked(auth.turnstileSiteKey).mockReturnValue('site-key')

			const res = await app.request('/auth/register/options')

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ turnstile_site_key: 'site-key' })
		})
	})

	describe('POST /auth/register', () => {
		const CHECK_EMAIL = { message: 'Check your email to finish signing up' }

		it('registers a new user and asks them to check their email', async () => {
			vi.mocked(auth.registerUser).mockResolvedValueOnce({
				...session.user,
				email: 'new@example.com',
			})

			const res = await post('/auth/register', {
				email: 'new@example.com',
				password: 'password123',
			})

			expect(res.status).toBe(202)

			expect(await res.json()).toEqual(CHECK_EMAIL)
		})

		it('emails a verification link that opens the app', async () => {
			const user = { ...session.user, email: 'new@example.com' }

			vi.mocked(auth.registerUser).mockResolvedValueOnce(user)

			await post('/auth/register', { email: 'new@example.com', password: 'password123' })

			expect(auth.sendVerificationEmail).toHaveBeenCalledWith(user, 'http://localhost:3000')

			expect(auth.sendAccountExistsEmail).not.toHaveBeenCalled()
		})

		it('answers a taken email the same way and emails its owner', async () => {
			vi.mocked(auth.registerUser).mockResolvedValueOnce(null)

			const res = await post('/auth/register', {
				email: 'existing@example.com',
				password: 'password123',
			})

			expect(res.status).toBe(202)

			expect(await res.json()).toEqual(CHECK_EMAIL)

			expect(auth.sendAccountExistsEmail).toHaveBeenCalledWith(
				'existing@example.com',
				'http://localhost:3000',
			)

			expect(auth.sendVerificationEmail).not.toHaveBeenCalled()
		})

		it('checks the Turnstile token before making the account', async () => {
			vi.mocked(auth.checkTurnstile).mockRejectedValueOnce(
				new AuthError('turnstile_failed', 'Not human'),
			)

			const res = await post('/auth/register', {
				email: 'new@example.com',
				password: 'password123',
				turnstile_token: 'token',
			})

			expect(res.status).toBe(400)

			expect(auth.checkTurnstile).toHaveBeenCalledWith('token', expect.any(String))

			expect(auth.registerUser).not.toHaveBeenCalled()
		})

		it('still answers when the email fails', async () => {
			vi.mocked(auth.registerUser).mockResolvedValueOnce(session.user)

			vi.mocked(auth.sendVerificationEmail).mockRejectedValueOnce(new Error('mail down'))

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

			expect(auth.sendVerificationEmail).toHaveBeenCalledWith(session.user, 'http://localhost:3000')
		})

		it('returns 409 when the email is verified', async () => {
			vi.mocked(auth.findSession).mockResolvedValue({
				...session,
				user: { ...session.user, is_verified: true },
			})

			const res = await post('/auth/verify-email', undefined, cookie())

			expect(res.status).toBe(409)

			expect(auth.sendVerificationEmail).not.toHaveBeenCalled()
		})

		it('returns 429 within a minute of the last link', async () => {
			vi.mocked(auth.sendVerificationEmail).mockRejectedValueOnce(
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

			expect(auth.sendVerificationEmail).not.toHaveBeenCalled()
		})

		it('returns 401 without a session', async () => {
			const res = await post('/auth/verify-email')

			expect(res.status).toBe(401)
		})
	})

	describe('POST /auth/verify-email/confirm', () => {
		it('verifies the email of the link', async () => {
			vi.mocked(auth.verifyEmail).mockResolvedValueOnce(USER_ID)

			const res = await post('/auth/verify-email/confirm', { token: 'abc' })

			expect(res.status).toBe(204)

			expect(auth.verifyEmail).toHaveBeenCalledWith('abc')

			expect(auth.recordActivity).toHaveBeenCalledWith(
				expect.objectContaining({ userId: USER_ID, action: 'email_verified' }),
			)
		})

		it('returns 400 for an expired link', async () => {
			vi.mocked(auth.verifyEmail).mockRejectedValueOnce(new AuthError('link_expired', 'Expired'))

			const res = await post('/auth/verify-email/confirm', { token: 'abc' })

			expect(res.status).toBe(400)
		})
	})

	describe('POST /auth/reset-password', () => {
		it('answers 202 and asks for a link on the app', async () => {
			const res = await post('/auth/reset-password', { email: 'test@example.com' })

			expect(res.status).toBe(202)

			expect(auth.requestPasswordReset).toHaveBeenCalledWith(
				'test@example.com',
				'http://localhost:3000',
			)
		})

		it('answers the same when sending fails', async () => {
			vi.mocked(auth.requestPasswordReset).mockRejectedValueOnce(new Error('mail down'))

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

			expect(auth.requestPasswordReset).not.toHaveBeenCalled()
		})
	})

	describe('POST /auth/reset-password/confirm', () => {
		it('sets the new password', async () => {
			vi.mocked(auth.resetPassword).mockResolvedValueOnce(USER_ID)

			const res = await post('/auth/reset-password/confirm', {
				token: 'abc',
				password: 'new password',
			})

			expect(res.status).toBe(204)

			expect(auth.resetPassword).toHaveBeenCalledWith('abc', 'new password')

			expect(auth.recordActivity).toHaveBeenCalledWith(
				expect.objectContaining({ userId: USER_ID, action: 'password_reset' }),
			)
		})

		it('rejects a weak password', async () => {
			const res = await post('/auth/reset-password/confirm', { token: 'abc', password: 'x' })

			expect(res.status).toBe(400)

			expect(auth.resetPassword).not.toHaveBeenCalled()
		})

		it('returns 400 for an expired link', async () => {
			vi.mocked(auth.resetPassword).mockRejectedValueOnce(new AuthError('link_expired', 'Expired'))

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
