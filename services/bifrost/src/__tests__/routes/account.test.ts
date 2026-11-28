import { stubServiceEnv } from 'vali/env'

const MIMIR_URL = 'http://mimir.internal:8000'

const MIMIR_API_KEY = 'test-mimir-api-key-that-is-at-least-32-chars'

stubServiceEnv({ MIMIR_URL, MIMIR_API_KEY })

vi.mock('../../auth/index.js', { spy: true })

vi.mock('../../lib/repositories.js')

vi.mock('vidar/client', () => ({
	configure: vi.fn(),
	banCheck: vi.fn().mockReturnValue(async (_c: unknown, next: () => Promise<void>) => {
		await next()
	}),
	reportEvent: vi.fn(),
}))

vi.mock('../../lib/db.js', () => ({
	db: { ping: vi.fn().mockResolvedValue(true) },
}))

import type { User } from 'skuld'
import { createBifrostApp } from '../../app.js'
import * as auth from '../../auth/index.js'
import {
	mfaRepository,
	oauthRepository,
	sessionRepository,
	userRepository,
} from '../../lib/repositories.js'
import type { Session } from '../../lib/schemas.js'

const mockFindSession = vi.mocked(auth.findSession)

const mockGetFactors = vi.mocked(mfaRepository.getFactors)

const mockGetPasskeys = vi.mocked(auth.getPasskeys)

const mockGetIdentities = vi.mocked(oauthRepository.getIdentities)

const mockGetActivity = vi.mocked(auth.getActivity)

const mockDeleteUserSessions = vi.mocked(sessionRepository.deleteUserSessions)

const mockDeleteUser = vi.mocked(userRepository.deleteUser)

const mockSendAccountDeletedEmail = vi.mocked(auth.sendAccountDeletedEmail)

const ORIGIN = 'http://localhost:3000'

const app = createBifrostApp()

const user: User = {
	id: '00000000-0000-4000-8000-000000000001',
	email: 'user@example.com',
	name: null,
	is_active: true,
	is_verified: true,
	roles: ['user'],
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
}

const session: Session = {
	id: 'session-hash',
	created_at: new Date().toISOString(),
	expires_at: '2026-10-26T00:00:00.000Z',
	two_step: false,
	user,
}

const headers = {
	'Content-Type': 'application/json',
	Cookie: '__Host-session=token',
	Origin: ORIGIN,
}

const noFactors = { passkeys: 0, totp: false, recovery_codes: 0 }

const appData = { places: [], visits: { states: ['Ohio'], countries: [] } }

const fetchMock = vi.fn()

beforeEach(() => {
	vi.resetAllMocks()

	vi.stubGlobal('fetch', fetchMock)

	mockFindSession.mockResolvedValue(session)

	mockGetFactors.mockResolvedValue(noFactors)

	mockGetPasskeys.mockResolvedValue([])

	mockGetIdentities.mockResolvedValue([])

	mockGetActivity.mockResolvedValue([])

	mockDeleteUser.mockResolvedValue(user)

	mockSendAccountDeletedEmail.mockResolvedValue(undefined)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

function deleteAccount() {
	return app.request('/auth/account', { method: 'DELETE', headers })
}

describe('GET /auth/account/export', () => {
	it('returns everything kept about the user', async () => {
		mockGetPasskeys.mockResolvedValue([{ id: 'pk', created_at: '2026-01-02T00:00:00.000Z' }])

		mockGetIdentities.mockResolvedValue([])

		mockGetActivity.mockResolvedValue([])

		fetchMock.mockResolvedValue(Response.json(appData))

		const res = await app.request('/auth/account/export', { headers })

		expect(res.status).toBe(200)

		expect(await res.json()).toMatchObject({
			user,
			passkeys: [{ id: 'pk' }],
			connected_accounts: [],
			authenticator_app: false,
			activity: [],
			app_data: appData,
		})

		expect(res.headers.get('cache-control')).toBe('private, no-store')

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

		expect(url).toBe(`${MIMIR_URL}/api/account`)

		expect((init.headers as Record<string, string>)['x-mimir-user']).toContain(user.id)
	})

	it('returns 401 without a session', async () => {
		const res = await app.request('/auth/account/export', { headers: { Origin: ORIGIN } })

		expect(res.status).toBe(401)
	})

	it('answers 503 when Mimir is down', async () => {
		fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'))

		const res = await app.request('/auth/account/export', { headers })

		expect(res.status).toBe(503)
	})
})

describe('DELETE /auth/account', () => {
	it('deletes the app data, then the account, and emails the owner', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

		const res = await deleteAccount()

		expect(res.status).toBe(204)

		expect(mockDeleteUserSessions).toHaveBeenCalledWith(user.id, { except: session.id })

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

		expect(url).toBe(`${MIMIR_URL}/api/account`)

		expect(init.method).toBe('DELETE')

		expect(mockDeleteUser).toHaveBeenCalledWith(user.id)

		expect(res.headers.get('set-cookie')).toContain('__Host-session=;')

		await vi.waitFor(() => {
			expect(mockSendAccountDeletedEmail).toHaveBeenCalledWith(user)
		})
	})

	it('keeps the account when Mimir fails', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 500 }))

		const res = await deleteAccount()

		expect(res.status).toBe(503)

		expect(mockDeleteUser).not.toHaveBeenCalled()
	})

	it('asks for the second step when the user has a second factor', async () => {
		mockGetFactors.mockResolvedValue({ ...noFactors, passkeys: 1 })

		const res = await deleteAccount()

		expect(res.status).toBe(403)

		expect(await res.json()).toMatchObject({ code: 'second_step_required' })

		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('asks for a recent sign-in', async () => {
		mockFindSession.mockResolvedValue({ ...session, created_at: '2026-01-01T00:00:00.000Z' })

		const res = await deleteAccount()

		expect(res.status).toBe(403)

		expect(await res.json()).toMatchObject({
			code: 'sign_in_again',
			message: 'Sign in again to delete your account',
		})

		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('lets an unverified user delete their account', async () => {
		mockFindSession.mockResolvedValue({ ...session, user: { ...user, is_verified: false } })

		fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

		const res = await deleteAccount()

		expect(res.status).toBe(204)
	})

	it('keeps the account when Mimir refuses', async () => {
		fetchMock.mockResolvedValue(Response.json({ message: 'Too many requests' }, { status: 429 }))

		const res = await deleteAccount()

		expect(res.status).toBe(503)

		expect(mockDeleteUser).not.toHaveBeenCalled()
	})

	it('refuses an admin and touches nothing', async () => {
		mockFindSession.mockResolvedValue({
			...session,
			two_step: true,
			user: { ...user, roles: ['user', 'admin'] },
		})

		const res = await deleteAccount()

		expect(res.status).toBe(403)

		expect(mockDeleteUserSessions).not.toHaveBeenCalled()

		expect(fetchMock).not.toHaveBeenCalled()
	})
})
