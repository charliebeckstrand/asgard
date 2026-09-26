import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { createDatabaseClient, type Db } from 'saga'
import {
	applyMigrations,
	isDockerAvailable,
	startPostgres,
	type TestDatabase,
} from 'vali/containers'
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

	await applyMigrations(pool, migrationsDir)

	db = createDatabaseClient(pool)

	vi.doMock('../db.js', () => ({
		db,
		closePool: vi.fn().mockResolvedValue(undefined),
		migrate: vi.fn().mockResolvedValue(undefined),
	}))

	users = (await import('../user-repository.js')).createUserRepository()

	sessions = (await import('../session-repository.js')).createSessionRepository()
}, 60_000)

afterAll(async () => {
	await pool?.end()

	await testDb?.stop()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await pool.query('TRUNCATE users CASCADE')
})

const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

async function openSession(userId?: string) {
	const user = userId ?? (await users.insertUser(randomUUID(), `${randomUUID()}@x.dev`, 'h')).id

	const id = randomUUID()
	const jti = randomUUID()

	await sessions.createSession(id, user, jti, inAWeek())

	return { id, jti, userId: user }
}

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('createSessionRepository (integration)', () => {
	describe('getSessionUser', () => {
		it('returns the user of a live session', async () => {
			const { id, userId } = await openSession()

			expect(await sessions.getSessionUser(id)).toEqual({ id: userId, role: 'user' })
		})

		it('returns null once the session is revoked', async () => {
			const { id } = await openSession()

			await sessions.revokeSession(id)

			expect(await sessions.getSessionUser(id)).toBeNull()
		})

		it('returns null once the user is deactivated', async () => {
			const { id, userId } = await openSession()

			await users.updateUser(userId, { is_active: false })

			expect(await sessions.getSessionUser(id)).toBeNull()
		})

		it('returns null once the session expires', async () => {
			const { id } = await openSession()

			await pool.query("UPDATE sessions SET expires_at = now() - interval '1 second'")

			expect(await sessions.getSessionUser(id)).toBeNull()
		})
	})

	describe('rotateSession', () => {
		it('swaps the jti and remembers the previous one', async () => {
			const { id, jti } = await openSession()

			const next = randomUUID()

			expect(await sessions.rotateSession(id, jti, next, inAWeek())).toBe(true)

			const row = await sessions.getSession(id)

			expect(row?.refresh_jti).toBe(next)

			expect(row?.previous_jti).toBe(jti)

			expect(row?.rotated_at).toBeInstanceOf(Date)
		})

		it('refuses a stale jti', async () => {
			const { id, jti } = await openSession()

			await sessions.rotateSession(id, jti, randomUUID(), inAWeek())

			expect(await sessions.rotateSession(id, jti, randomUUID(), inAWeek())).toBe(false)
		})

		it('refuses a revoked session', async () => {
			const { id, jti } = await openSession()

			await sessions.revokeSession(id)

			expect(await sessions.rotateSession(id, jti, randomUUID(), inAWeek())).toBe(false)
		})
	})

	describe('revokeUserSessions', () => {
		it("revokes only that user's sessions", async () => {
			const first = await openSession()
			const second = await openSession(first.userId)
			const other = await openSession()

			await sessions.revokeUserSessions(first.userId)

			expect(await sessions.getSessionUser(first.id)).toBeNull()

			expect(await sessions.getSessionUser(second.id)).toBeNull()

			expect(await sessions.getSessionUser(other.id)).not.toBeNull()
		})
	})

	describe('createSession', () => {
		it("prunes the user's revoked sessions", async () => {
			const { id, userId } = await openSession()

			await sessions.revokeSession(id)

			await openSession(userId)

			expect(await sessions.getSession(id)).toBeNull()
		})
	})

	it('drops sessions when the user is deleted', async () => {
		const { id, userId } = await openSession()

		await users.deleteUser(userId)

		expect(await sessions.getSession(id)).toBeNull()
	})
})
