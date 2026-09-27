import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { isDockerAvailable } from 'vali/containers'
import type { EmailTokenRepository, UserRepository } from '../../auth/types.js'
import { createEmailTokenRepository } from '../email-token-repository.js'
import { createUserRepository } from '../user-repository.js'
import { startTestDb, type TestDb } from './test-db.js'

let testDb: TestDb
let pool: Pool
let users: UserRepository
let tokens: EmailTokenRepository

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startTestDb()

	pool = testDb.pool

	users = createUserRepository(testDb.db)

	tokens = createEmailTokenRepository(testDb.db)
}, 60_000)

afterAll(async () => {
	await testDb?.stop()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await testDb.reset()
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

			const { email } = (await users.getUserById(userId)) as { email: string }

			await pool.query('INSERT INTO failed_logins (email, count) VALUES ($1, 5)', [email])

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

			const failed = await pool.query('SELECT 1 FROM failed_logins WHERE email = $1', [email])

			expect(failed.rows).toHaveLength(0)
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

	describe('countSentEmail', () => {
		const limits = { total: 3, unverified: 2, recipient: 2 }

		it('counts emails until the total is reached', async () => {
			expect(await tokens.countSentEmail('a@x.dev', true, limits)).toBe(true)

			expect(await tokens.countSentEmail('b@x.dev', true, limits)).toBe(true)

			expect(await tokens.countSentEmail('c@x.dev', true, limits)).toBe(true)

			expect(await tokens.countSentEmail('d@x.dev', true, limits)).toBe(false)
		})

		it('keeps the rest of the total for verified addresses', async () => {
			await tokens.countSentEmail('a@x.dev', false, limits)

			await tokens.countSentEmail('b@x.dev', false, limits)

			expect(await tokens.countSentEmail('c@x.dev', false, limits)).toBe(false)

			expect(await tokens.countSentEmail('c@x.dev', true, limits)).toBe(true)
		})

		it('limits the emails to one address', async () => {
			await tokens.countSentEmail('a@x.dev', true, limits)

			await tokens.countSentEmail('a@x.dev', true, limits)

			expect(await tokens.countSentEmail('a@x.dev', true, limits)).toBe(false)

			expect(await tokens.countSentEmail('b@x.dev', true, limits)).toBe(true)
		})

		it('lets only as many through at once as there is room for', async () => {
			const counted = await Promise.all(
				Array.from({ length: 10 }, (_, i) => tokens.countSentEmail(`${i}@x.dev`, true, limits)),
			)

			expect(counted.filter(Boolean)).toHaveLength(3)
		})

		it('forgets emails sent more than a day ago', async () => {
			await pool.query(
				"INSERT INTO sent_emails (recipient, verified, sent_at) VALUES ('a@x.dev', true, now() - interval '25 hours'), ('a@x.dev', true, now() - interval '25 hours')",
			)

			expect(await tokens.countSentEmail('a@x.dev', true, limits)).toBe(true)

			expect(await tokens.deleteOldSentEmails()).toBe(2)
		})
	})
})
