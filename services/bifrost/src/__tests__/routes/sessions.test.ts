import { stubServiceEnv } from 'vali/env'

stubServiceEnv()

vi.mock('../../auth/index.js', { spy: true })

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

import type { Activity, Session } from 'skuld'
import { createBifrostApp } from '../../app.js'
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
		name: null,
		is_active: true,
		is_verified: false,
		roles: ['user'],
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
	},
}

const app = createBifrostApp()

const cookie = { Cookie: '__Host-session=token' }

describe('Session routes', () => {
	beforeEach(() => {
		vi.resetAllMocks()

		vi.mocked(auth.findSession).mockResolvedValue(session)

		vi.mocked(auth.deleteSession).mockResolvedValue()

		vi.mocked(auth.deleteUserSessions).mockResolvedValue()

		vi.mocked(auth.recordActivity).mockResolvedValue()
	})

	describe('GET /auth/session', () => {
		it('returns 401 without a cookie and never looks one up', async () => {
			const res = await app.request('/auth/session')

			expect(res.status).toBe(401)

			expect(auth.findSession).not.toHaveBeenCalled()
		})

		it('returns the live session with its user', async () => {
			const res = await app.request('/auth/session', { headers: cookie })

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual(session)

			expect(res.headers.get('cache-control')).toBe('private, no-store')

			expect(auth.findSession).toHaveBeenCalledWith('token')
		})

		it('returns 401 and clears the cookie when the session is gone', async () => {
			vi.mocked(auth.findSession).mockResolvedValueOnce(null)

			const res = await app.request('/auth/session', { headers: cookie })

			expect(res.status).toBe(401)

			expect(res.headers.get('set-cookie')).toContain('__Host-session=;')
		})
	})

	describe('POST /auth/logout', () => {
		it('deletes the current session and clears the cookie', async () => {
			const res = await app.request('/auth/logout', {
				method: 'POST',
				headers: { ...cookie, Origin: ORIGIN },
			})

			expect(res.status).toBe(200)

			expect(auth.deleteSession).toHaveBeenCalledWith(session.id)

			expect(res.headers.get('set-cookie')).toContain('__Host-session=;')
		})

		it('clears the cookie even without a session', async () => {
			const res = await app.request('/auth/logout', {
				method: 'POST',
				headers: { Origin: ORIGIN },
			})

			expect(res.status).toBe(200)

			expect(auth.deleteSession).not.toHaveBeenCalled()
		})
	})

	describe('DELETE /auth/sessions', () => {
		it('returns 401 without a session', async () => {
			const res = await app.request('/auth/sessions', {
				method: 'DELETE',
				headers: { Origin: ORIGIN },
			})

			expect(res.status).toBe(401)

			expect(auth.deleteUserSessions).not.toHaveBeenCalled()
		})

		it("deletes the user's other sessions and keeps this one", async () => {
			const res = await app.request('/auth/sessions', {
				method: 'DELETE',
				headers: { ...cookie, Origin: ORIGIN },
			})

			expect(res.status).toBe(204)

			expect(auth.deleteUserSessions).toHaveBeenCalledWith(USER_ID, session.id)

			expect(auth.recordActivity).toHaveBeenCalledWith(
				expect.objectContaining({ userId: USER_ID, action: 'signed_out_elsewhere' }),
			)
		})
	})

	describe('GET /auth/activity', () => {
		it("returns the signed-in user's recent activity", async () => {
			const entry: Activity = {
				id: '00000000-0000-7000-8000-000000000002',
				action: 'signed_in',
				detail: 'password',
				actor_id: USER_ID,
				ip: '203.0.113.9',
				created_at: '2026-09-27T00:00:00.000Z',
			}

			vi.mocked(auth.getActivity).mockResolvedValueOnce([entry])

			const res = await app.request('/auth/activity', { headers: cookie })

			expect(res.status).toBe(200)

			expect(await res.json()).toEqual({ data: [entry], total: 1 })

			expect(auth.getActivity).toHaveBeenCalledWith(USER_ID)

			expect(res.headers.get('cache-control')).toBe('private, no-store')
		})

		it('returns 401 without a session', async () => {
			const res = await app.request('/auth/activity')

			expect(res.status).toBe(401)

			expect(auth.getActivity).not.toHaveBeenCalled()
		})
	})
})
