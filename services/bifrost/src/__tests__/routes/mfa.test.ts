import { stubServiceEnv } from 'vali/env'

stubServiceEnv()

const {
	mockFindSession,
	mockGetFactors,
	mockStartTotpSetup,
	mockConfirmTotp,
	mockDeleteTotp,
	mockGenerateRecoveryCodes,
	mockRequireRecentSignIn,
} = vi.hoisted(() => ({
	mockFindSession: vi.fn(),
	mockGetFactors: vi.fn(),
	mockStartTotpSetup: vi.fn(),
	mockConfirmTotp: vi.fn(),
	mockDeleteTotp: vi.fn(),
	mockGenerateRecoveryCodes: vi.fn(),
	mockRequireRecentSignIn: vi.fn(),
}))

import { AuthError } from '../../auth/errors.js'

vi.mock('../../auth/index.js', async () => {
	const errors =
		await vi.importActual<typeof import('../../auth/errors.js')>('../../auth/errors.js')

	const mfa = await vi.importActual<typeof import('../../auth/mfa.js')>('../../auth/mfa.js')

	return {
		configure: vi.fn(),
		getConfig: vi.fn(),
		AuthError: errors.AuthError,
		SESSION_TTL_SECONDS: 30 * 24 * 60 * 60,
		findSession: (...args: unknown[]) => mockFindSession(...args),
		secondFactorMethods: mfa.secondFactorMethods,
		getFactors: (...args: unknown[]) => mockGetFactors(...args),
		startTotpSetup: (...args: unknown[]) => mockStartTotpSetup(...args),
		confirmTotp: (...args: unknown[]) => mockConfirmTotp(...args),
		deleteTotp: (...args: unknown[]) => mockDeleteTotp(...args),
		generateRecoveryCodes: (...args: unknown[]) => mockGenerateRecoveryCodes(...args),
		requireRecentSignIn: (...args: unknown[]) => mockRequireRecentSignIn(...args),
	}
})

vi.mock('vidar/client', () => ({
	configure: vi.fn(),
	createVidar: vi.fn().mockReturnValue(async (_c: unknown, next: () => Promise<void>) => {
		await next()
	}),
	reportEvent: vi.fn(),
}))

vi.mock('../../lib/db.js', () => ({
	db: { ping: vi.fn().mockResolvedValue(true) },
	closePool: vi.fn(),
}))

import { createBifrostApp } from '../../app.js'

const ORIGIN = 'http://localhost:3000'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const session = {
	id: 'session-hash',
	created_at: '2026-09-26T00:00:00.000Z',
	expires_at: '2026-10-26T00:00:00.000Z',
	user: {
		id: USER_ID,
		email: 'alice@example.com',
		is_active: true,
		is_verified: false,
		role: 'user',
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
	},
}

const app = createBifrostApp()

const headers = {
	'Content-Type': 'application/json',
	Cookie: '__Host-session=token',
	Origin: ORIGIN,
}

describe('MFA routes', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		mockFindSession.mockResolvedValue(session)
	})

	it.each([
		['GET', '/auth/mfa'],
		['POST', '/auth/mfa/totp/setup'],
		['POST', '/auth/mfa/totp'],
		['DELETE', '/auth/mfa/totp'],
		['POST', '/auth/mfa/recovery-codes'],
	] as const)('returns 401 for %s %s without a session', async (method, path) => {
		const res = await app.request(path, {
			method,
			headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
			body: method === 'POST' ? JSON.stringify({}) : undefined,
		})

		expect(res.status).toBe(401)
	})

	it.each([
		['POST', '/auth/mfa/totp/setup', undefined],
		['POST', '/auth/mfa/totp', { code: '123456' }],
		['DELETE', '/auth/mfa/totp', undefined],
		['POST', '/auth/mfa/recovery-codes', undefined],
	] as const)('asks for a recent sign-in on %s %s', async (method, path, body) => {
		mockRequireRecentSignIn.mockImplementationOnce(() => {
			throw new AuthError('sign_in_again', 'Sign in again to change how you sign in')
		})

		const res = await app.request(path, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		})

		expect(res.status).toBe(403)

		expect(mockStartTotpSetup).not.toHaveBeenCalled()

		expect(mockConfirmTotp).not.toHaveBeenCalled()

		expect(mockDeleteTotp).not.toHaveBeenCalled()

		expect(mockGenerateRecoveryCodes).not.toHaveBeenCalled()
	})

	it('shows your second factors and whether two-step sign-in is on', async () => {
		mockGetFactors.mockResolvedValueOnce({ passkeys: 0, totp: true, recovery_codes: 8 })

		const res = await app.request('/auth/mfa', { headers })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual({ enabled: true, passkeys: 0, totp: true, recovery_codes: 8 })

		expect(res.headers.get('cache-control')).toBe('private, no-store')

		expect(mockRequireRecentSignIn).not.toHaveBeenCalled()
	})

	it('reports two-step sign-in off when only recovery codes are left', async () => {
		mockGetFactors.mockResolvedValueOnce({ passkeys: 0, totp: false, recovery_codes: 2 })

		const res = await app.request('/auth/mfa', { headers })

		expect(await res.json()).toMatchObject({ enabled: false })
	})

	it('starts an authenticator app setup for your account', async () => {
		mockStartTotpSetup.mockResolvedValueOnce({ secret: 'ABC', uri: 'otpauth://totp/x' })

		const res = await app.request('/auth/mfa/totp/setup', { method: 'POST', headers })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual({ secret: 'ABC', uri: 'otpauth://totp/x' })

		expect(mockStartTotpSetup).toHaveBeenCalledWith(session.user)
	})

	it('returns 409 when an authenticator app is already on', async () => {
		mockStartTotpSetup.mockRejectedValueOnce(
			new AuthError('totp_exists', 'Remove the authenticator app before adding another'),
		)

		const res = await app.request('/auth/mfa/totp/setup', { method: 'POST', headers })

		expect(res.status).toBe(409)
	})

	it('confirms the authenticator app with a code', async () => {
		const res = await app.request('/auth/mfa/totp', {
			method: 'POST',
			headers,
			body: JSON.stringify({ code: '123456' }),
		})

		expect(res.status).toBe(204)

		expect(mockConfirmTotp).toHaveBeenCalledWith(USER_ID, '123456')
	})

	it('returns 400 for a wrong confirmation code', async () => {
		mockConfirmTotp.mockRejectedValueOnce(
			new AuthError('code_rejected', 'That code is not correct'),
		)

		const res = await app.request('/auth/mfa/totp', {
			method: 'POST',
			headers,
			body: JSON.stringify({ code: '000000' }),
		})

		expect(res.status).toBe(400)
	})

	it('removes the authenticator app', async () => {
		const res = await app.request('/auth/mfa/totp', { method: 'DELETE', headers })

		expect(res.status).toBe(204)

		expect(mockDeleteTotp).toHaveBeenCalledWith(USER_ID)
	})

	it("returns 409 for an admin's last second factor", async () => {
		mockDeleteTotp.mockRejectedValueOnce(
			new AuthError('last_admin_factor', 'An admin must keep a passkey or an authenticator app'),
		)

		const res = await app.request('/auth/mfa/totp', { method: 'DELETE', headers })

		expect(res.status).toBe(409)
	})

	it('returns new recovery codes, uncached', async () => {
		mockGenerateRecoveryCodes.mockResolvedValueOnce(['abcde-fghjk'])

		const res = await app.request('/auth/mfa/recovery-codes', { method: 'POST', headers })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual({ codes: ['abcde-fghjk'] })

		expect(res.headers.get('cache-control')).toBe('private, no-store')

		expect(mockGenerateRecoveryCodes).toHaveBeenCalledWith(USER_ID)
	})
})
