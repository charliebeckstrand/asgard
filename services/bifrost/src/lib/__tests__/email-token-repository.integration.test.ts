import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { createDb, type Db, migrate } from 'saga'
import { isDockerAvailable, startPostgres, type TestDatabase } from 'vali/containers'
import { stubServiceEnv } from 'vali/env'
import type { EmailTokenRepository, UserRepository } from '../../auth/types.js'

stubServiceEnv()

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

let testDb: TestDatabase
let pool: Pool
let db: Db
let users: UserRepository
let tokens: EmailTokenRepository

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startPostgres()

	pool = new Pool({ connectionString: testDb.connectionUri })

	await migrate({ url: testDb.connectionUri }, migrationsDir)

	db = createDb(() => ({ url: testDb.connectionUri }))

	vi.doMock('../db.js', () => ({ db }))

	users = (await import('../user-repository.js')).createUserRepository()

	tokens = (await import('../email-token-repository.js')).createEmailTokenRepository()
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

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000)

async function insertUser() {
	return (await users.insertUser(`${randomUUID()}@x.dev`, 'old-hash')).id
}

async function getUser(userId: string) {
	const { rows } = await pool.query(
		'SELECT hashed_password, is_verified FROM users WHERE id = $1',
		[userId],
	)

	return rows[0]
}

async function tokenIds(userId: string) {
	const { rows } = await pool.query('SELECT id FROM email_tokens WHERE user_id = $1', [userId])

	return rows.map((row) => row.id)
}

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('createEmailTokenRepository (integration)', () => {
	describe('createToken', () => {
		it('stores a link', async () => {
			const userId = await insertUser()

			expect(await tokens.createToken('t1', userId, 'verify_email', inAnHour(), 60)).toBe(true)

			expect(await tokenIds(userId)).toEqual(['t1'])
		})

		it('refuses a second link of one purpose within the interval', async () => {
			const userId = await insertUser()

			await tokens.createToken('t1', userId, 'verify_email', inAnHour(), 60)

			expect(await tokens.createToken('t2', userId, 'verify_email', inAnHour(), 60)).toBe(false)

			expect(await tokenIds(userId)).toEqual(['t1'])
		})

		it('replaces the last link once the interval passed', async () => {
			const userId = await insertUser()

			await tokens.createToken('t1', userId, 'verify_email', inAnHour(), 60)

			await pool.query("UPDATE email_tokens SET created_at = now() - interval '2 minutes'")

			expect(await tokens.createToken('t2', userId, 'verify_email', inAnHour(), 60)).toBe(true)

			expect(await tokenIds(userId)).toEqual(['t2'])
		})

		it('keeps one link of each purpose', async () => {
			const userId = await insertUser()

			await tokens.createToken('t1', userId, 'verify_email', inAnHour(), 60)

			expect(await tokens.createToken('t2', userId, 'reset_password', inAnHour(), 60)).toBe(true)

			expect((await tokenIds(userId)).sort()).toEqual(['t1', 't2'])
		})
	})

	describe('verifyEmail', () => {
		it('verifies the email once', async () => {
			const userId = await insertUser()

			await tokens.createToken('t1', userId, 'verify_email', inAnHour(), 60)

			expect(await tokens.verifyEmail('t1')).toBe(true)

			expect((await getUser(userId)).is_verified).toBe(true)

			expect(await tokens.verifyEmail('t1')).toBe(false)
		})

		it('ignores an expired link', async () => {
			const userId = await insertUser()

			await tokens.createToken('t1', userId, 'verify_email', new Date(Date.now() - 1000), 60)

			expect(await tokens.verifyEmail('t1')).toBe(false)

			expect((await getUser(userId)).is_verified).toBe(false)
		})

		it("won't use a reset link", async () => {
			const userId = await insertUser()

			await tokens.createToken('t1', userId, 'reset_password', inAnHour(), 60)

			expect(await tokens.verifyEmail('t1')).toBe(false)

			expect(await tokenIds(userId)).toEqual(['t1'])
		})
	})

	describe('resetPassword', () => {
		it('sets the password, verifies the email and ends every session and link', async () => {
			const userId = await insertUser()

			await tokens.createToken('t1', userId, 'reset_password', inAnHour(), 60)

			await tokens.createToken('t2', userId, 'verify_email', inAnHour(), 60)

			await pool.query(
				"INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', $1, now() + interval '1 day')",
				[userId],
			)

			expect(await tokens.resetPassword('t1', 'new-hash')).toBe(true)

			expect(await getUser(userId)).toEqual({ hashed_password: 'new-hash', is_verified: true })

			expect(await tokenIds(userId)).toEqual([])

			const { rows } = await pool.query('SELECT 1 FROM sessions WHERE user_id = $1', [userId])

			expect(rows).toHaveLength(0)
		})

		it('changes nothing with an unknown or expired link', async () => {
			const userId = await insertUser()

			await tokens.createToken('t1', userId, 'reset_password', new Date(Date.now() - 1000), 60)

			expect(await tokens.resetPassword('t1', 'new-hash')).toBe(false)

			expect(await tokens.resetPassword('nope', 'new-hash')).toBe(false)

			expect(await getUser(userId)).toEqual({ hashed_password: 'old-hash', is_verified: false })
		})

		it("won't use a verification link", async () => {
			const userId = await insertUser()

			await tokens.createToken('t1', userId, 'verify_email', inAnHour(), 60)

			expect(await tokens.resetPassword('t1', 'new-hash')).toBe(false)

			expect((await getUser(userId)).hashed_password).toBe('old-hash')
		})
	})

	it('sweeps expired links', async () => {
		const userId = await insertUser()

		await tokens.createToken('t1', userId, 'verify_email', new Date(Date.now() - 1000), 60)

		await tokens.createToken('t2', userId, 'reset_password', inAnHour(), 60)

		expect(await tokens.deleteExpiredTokens()).toBe(1)

		expect(await tokenIds(userId)).toEqual(['t2'])
	})
})
