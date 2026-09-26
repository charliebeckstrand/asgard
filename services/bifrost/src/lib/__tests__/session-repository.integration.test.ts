import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { createDb, type Db, migrate } from 'saga'
import { isDockerAvailable, startPostgres, type TestDatabase } from 'vali/containers'
import { stubServiceEnv } from 'vali/env'
import type { SessionRepository, UserRepository } from '../../auth/types.js'

stubServiceEnv()

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

let testDb: TestDatabase
let pool: Pool
let db: Db
let users: UserRepository
let sessions: SessionRepository

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startPostgres()

	pool = new Pool({ connectionString: testDb.connectionUri })

	await migrate({ url: testDb.connectionUri }, migrationsDir)

	db = createDb(() => ({ url: testDb.connectionUri }))

	vi.doMock('../db.js', () => ({ db }))

	users = (await import('../user-repository.js')).createUserRepository()

	sessions = (await import('../session-repository.js')).createSessionRepository()
}, 60_000)

afterAll(async () => {
	await db?.close()

	await pool?.end()

	await testDb?.stop()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await pool.query('TRUNCATE users CASCADE')
})

const inADay = () => new Date(Date.now() + 24 * 60 * 60 * 1000)

async function insertUser() {
	return (await users.insertUser(`${randomUUID()}@x.dev`, 'h')).id
}

async function openSession(userId: string, options: { replacing?: string; limit?: number } = {}) {
	const id = randomUUID()

	await sessions.createSession(id, userId, inADay(), { limit: 10, ...options })

	return id
}

async function sessionIds(userId: string) {
	const { rows } = await pool.query<{ id: string }>(
		'SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at',
		[userId],
	)

	return rows.map((r) => r.id)
}

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('createSessionRepository (integration)', () => {
	describe('createSession', () => {
		it('returns the session with its user', async () => {
			const userId = await insertUser()

			const id = randomUUID()

			const session = await sessions.createSession(id, userId, inADay(), { limit: 10 })

			expect(session.id).toBe(id)

			expect(session.user.id).toBe(userId)

			expect(session.user.role).toBe('user')
		})

		it('deletes the session it replaces', async () => {
			const userId = await insertUser()

			const old = await openSession(userId)

			const next = await openSession(userId, { replacing: old })

			expect(await sessionIds(userId)).toEqual([next])
		})

		it('keeps only the newest sessions up to the limit', async () => {
			const userId = await insertUser()

			const first = await openSession(userId, { limit: 2 })
			const second = await openSession(userId, { limit: 2 })
			const third = await openSession(userId, { limit: 2 })

			expect(await sessionIds(userId)).toEqual([second, third])

			expect(await sessionIds(userId)).not.toContain(first)
		})

		it('holds the limit under concurrent sign-ins', async () => {
			const userId = await insertUser()

			await Promise.all(Array.from({ length: 5 }, () => openSession(userId, { limit: 2 })))

			expect(await sessionIds(userId)).toHaveLength(2)
		})

		it('keeps the new session when another looks newer', async () => {
			const userId = await insertUser()

			// A sign-in that began later but committed first, while this one waited on the lock.
			await pool.query(
				"INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('later', $1, now() + interval '1 second', now() + interval '1 day')",
				[userId],
			)

			const id = await openSession(userId, { limit: 1 })

			expect(await sessionIds(userId)).toEqual([id])
		})

		it("never touches another user's sessions", async () => {
			const alice = await insertUser()
			const bob = await insertUser()

			const bobs = await openSession(bob, { limit: 1 })

			await openSession(alice, { limit: 1 })

			expect(await sessionIds(bob)).toEqual([bobs])
		})
	})

	describe('findSession', () => {
		it('finds a live session', async () => {
			const userId = await insertUser()

			const id = await openSession(userId)

			expect((await sessions.findSession(id))?.user.id).toBe(userId)
		})

		it('ignores an expired session', async () => {
			const id = await openSession(await insertUser())

			await pool.query("UPDATE sessions SET expires_at = now() - interval '1 second'")

			expect(await sessions.findSession(id)).toBeNull()
		})

		it('ignores the session of a deactivated user', async () => {
			const userId = await insertUser()

			const id = await openSession(userId)

			await users.setUserActive(userId, false)

			expect(await sessions.findSession(id)).toBeNull()
		})

		it('reflects a role change at once', async () => {
			const userId = await insertUser()

			const id = await openSession(userId)

			await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [userId])

			expect((await sessions.findSession(id))?.user.role).toBe('admin')
		})
	})

	describe('deleteUserSessions', () => {
		it('deletes every session but the one to keep', async () => {
			const userId = await insertUser()

			const keep = await openSession(userId)

			await openSession(userId)

			await sessions.deleteUserSessions(userId, { except: keep })

			expect(await sessionIds(userId)).toEqual([keep])
		})

		it('deletes all of them without an exception', async () => {
			const userId = await insertUser()

			await openSession(userId)

			await sessions.deleteUserSessions(userId)

			expect(await sessionIds(userId)).toEqual([])
		})
	})

	it('deleteExpiredSessions removes only expired rows', async () => {
		const userId = await insertUser()

		const expired = await openSession(userId)
		const live = await openSession(userId)

		await pool.query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE id = $1", [
			expired,
		])

		expect(await sessions.deleteExpiredSessions()).toBe(1)

		expect(await sessionIds(userId)).toEqual([live])
	})

	it('drops sessions when the user is deleted', async () => {
		const userId = await insertUser()

		await openSession(userId)

		await pool.query('DELETE FROM users WHERE id = $1', [userId])

		expect(await sessionIds(userId)).toEqual([])
	})
})
