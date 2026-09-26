import { stubServiceEnv } from 'vali/env'

stubServiceEnv()

const {
	mockFindSession,
	mockGetPasskeys,
	mockCreateRegistrationOptions,
	mockRegisterPasskey,
	mockDeletePasskey,
	mockRequireRecentSignIn,
} = vi.hoisted(() => ({
	mockFindSession: vi.fn(),
	mockGetPasskeys: vi.fn(),
	mockCreateRegistrationOptions: vi.fn(),
	mockRegisterPasskey: vi.fn(),
	mockDeletePasskey: vi.fn(),
	mockRequireRecentSignIn: vi.fn(),
}))

import { AuthError } from '../../auth/errors.js'

vi.mock('../../auth/index.js', async () => {
	const errors =
		await vi.importActual<typeof import('../../auth/errors.js')>('../../auth/errors.js')

	return {
		configure: vi.fn(),
		getConfig: vi.fn(),
		AuthError: errors.AuthError,
		SESSION_TTL_SECONDS: 30 * 24 * 60 * 60,
		findSession: (...args: unknown[]) => mockFindSession(...args),
		getPasskeys: (...args: unknown[]) => mockGetPasskeys(...args),
		createRegistrationOptions: (...args: unknown[]) => mockCreateRegistrationOptions(...args),
		registerPasskey: (...args: unknown[]) => mockRegisterPasskey(...args),
		deletePasskey: (...args: unknown[]) => mockDeletePasskey(...args),
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

const passkey = { id: 'credential-1', created_at: '2026-09-26T00:00:00.000Z' }

const credential = {
	id: 'credential-1',
	rawId: 'credential-1',
	type: 'public-key',
	response: { clientDataJSON: 'x', attestationObject: 'y' },
	clientExtensionResults: {},
}

const app = createBifrostApp()

const headers = {
	'Content-Type': 'application/json',
	Cookie: '__Host-session=token',
	Origin: ORIGIN,
}

describe('Passkeys routes', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		mockFindSession.mockResolvedValue(session)
	})

	it.each([
		['GET', '/auth/passkeys'],
		['POST', '/auth/passkeys/options'],
		['POST', '/auth/passkeys'],
		['DELETE', '/auth/passkeys/credential-1'],
	] as const)('returns 401 for %s %s without a session', async (method, path) => {
		const res = await app.request(path, {
			method,
			headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
			body: method === 'POST' ? JSON.stringify({}) : undefined,
		})

		expect(res.status).toBe(401)
	})

	it.each([
		['POST', '/auth/passkeys/options', undefined],
		['POST', '/auth/passkeys', credential],
		['DELETE', '/auth/passkeys/credential-1', undefined],
	] as const)('asks for a recent sign-in on %s %s', async (method, path, body) => {
		mockRequireRecentSignIn.mockImplementationOnce(() => {
			throw new AuthError('sign_in_again', 'Sign in again to change your passkeys')
		})

		const res = await app.request(path, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		})

		expect(res.status).toBe(403)

		expect(mockCreateRegistrationOptions).not.toHaveBeenCalled()

		expect(mockRegisterPasskey).not.toHaveBeenCalled()

		expect(mockDeletePasskey).not.toHaveBeenCalled()
	})

	it('lists your passkeys without asking for a recent sign-in', async () => {
		mockGetPasskeys.mockResolvedValueOnce([passkey])

		const res = await app.request('/auth/passkeys', { headers })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual({ data: [passkey], total: 1 })

		expect(mockGetPasskeys).toHaveBeenCalledWith(USER_ID)

		expect(mockRequireRecentSignIn).not.toHaveBeenCalled()
	})

	it('returns registration options for your account', async () => {
		mockCreateRegistrationOptions.mockResolvedValueOnce({ challenge: 'abc' })

		const res = await app.request('/auth/passkeys/options', { method: 'POST', headers })

		expect(res.status).toBe(200)

		expect(await res.json()).toEqual({ challenge: 'abc' })

		expect(mockCreateRegistrationOptions).toHaveBeenCalledWith(session.user)
	})

	it('adds a passkey to your account', async () => {
		mockRegisterPasskey.mockResolvedValueOnce(passkey)

		const res = await app.request('/auth/passkeys', {
			method: 'POST',
			headers,
			body: JSON.stringify(credential),
		})

		expect(res.status).toBe(201)

		expect(await res.json()).toEqual(passkey)

		expect(mockRegisterPasskey).toHaveBeenCalledWith(
			USER_ID,
			expect.objectContaining({ id: 'credential-1' }),
		)
	})

	it('removes one of your passkeys', async () => {
		const res = await app.request('/auth/passkeys/credential-1', { method: 'DELETE', headers })

		expect(res.status).toBe(204)

		expect(mockDeletePasskey).toHaveBeenCalledWith(USER_ID, 'credential-1')
	})

	it("returns 409 for an admin's last second factor", async () => {
		mockDeletePasskey.mockRejectedValueOnce(
			new AuthError('last_admin_factor', 'An admin must keep a passkey or an authenticator app'),
		)

		const res = await app.request('/auth/passkeys/credential-1', { method: 'DELETE', headers })

		expect(res.status).toBe(409)
	})
})
