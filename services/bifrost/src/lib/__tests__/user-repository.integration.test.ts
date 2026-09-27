import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { isDockerAvailable } from 'vali/containers'
import type { UserRepository } from '../../auth/types.js'
import { createUserRepository } from '../user-repository.js'
import { startTestDb, type TestDb } from './test-db.js'

let testDb: TestDb
let pool: Pool
let repo: UserRepository

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startTestDb()

	pool = testDb.pool

	repo = createUserRepository(testDb.db)
}, 60_000)

afterAll(async () => {
	await testDb?.stop()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await testDb.reset()
})

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('createUserRepository (integration)', () => {
	describe('insertUser + getUserById', () => {
		it('inserts a user with a version 7 id and retrieves it', async () => {
			const inserted = await repo.insertUser('alice@example.com', 'hash')

			expect(inserted.id.charAt(14)).toBe('7')

			expect(inserted.email).toBe('alice@example.com')

			expect(inserted.is_active).toBe(true)

			expect(inserted.is_verified).toBe(false)

			expect(inserted.roles).toEqual(['user'])

			const fetched = await repo.getUserById(inserted.id)

			expect(fetched).not.toBeNull()

			expect(fetched?.email).toBe('alice@example.com')
		})

		it('returns null for an unknown id', async () => {
			expect(await repo.getUserById(randomUUID())).toBeNull()
		})

		it('rejects duplicate emails via unique index', async () => {
			await repo.insertUser('dup@example.com', 'hash')

			await expect(repo.insertUser('dup@example.com', 'hash')).rejects.toThrow()
		})
	})

	describe('getCredentialsByEmail', () => {
		it('returns credentials for an existing user', async () => {
			const { id } = await repo.insertUser('creds@example.com', 'hashed-pw')

			const creds = await repo.getCredentialsByEmail('creds@example.com')

			expect(creds).toEqual({
				id,
				hashed_password: 'hashed-pw',
				is_active: true,
				is_verified: false,
			})
		})

		it('returns null when the email is unknown', async () => {
			expect(await repo.getCredentialsByEmail('nobody@example.com')).toBeNull()
		})
	})

	describe('getUsers', () => {
		it('returns all users ordered by created_at', async () => {
			await repo.insertUser('a@example.com', 'h')

			await new Promise((r) => setTimeout(r, 5))

			await repo.insertUser('b@example.com', 'h')

			await new Promise((r) => setTimeout(r, 5))

			await repo.insertUser('c@example.com', 'h')

			const users = await repo.getUsers()

			expect(users.map((u) => u.email)).toEqual(['a@example.com', 'b@example.com', 'c@example.com'])
		})

		it('returns an empty array when no users exist', async () => {
			expect(await repo.getUsers()).toEqual([])
		})
	})

	describe('setUserActive', () => {
		it('updates is_active and refreshes updated_at', async () => {
			const before = await repo.insertUser('flip@example.com', 'h')

			const after = await repo.setUserActive(before.id, false)

			expect(after?.is_active).toBe(false)

			expect(new Date(after?.updated_at as string).getTime()).toBeGreaterThan(
				new Date(before.updated_at).getTime(),
			)
		})

		it('leaves admins alone', async () => {
			const { id } = await repo.insertUser('admin@example.com', 'h')

			await pool.query(`UPDATE users SET roles = '{user,admin}' WHERE id = $1`, [id])

			expect(await repo.setUserActive(id, false)).toBeNull()

			expect((await repo.getUserById(id))?.is_active).toBe(true)
		})

		it('returns null for a missing user', async () => {
			expect(await repo.setUserActive(randomUUID(), false)).toBeNull()
		})
	})

	describe('countFailedLogin', () => {
		it('counts tries up to the limit, then makes the next one wait', async () => {
			for (let i = 0; i < 3; i++) {
				expect(await repo.countFailedLogin('guess@example.com', 3, 60)).toBe(true)
			}

			expect(await repo.countFailedLogin('guess@example.com', 3, 60)).toBe(false)

			const { rows } = await pool.query('SELECT count FROM failed_logins WHERE email = $1', [
				'guess@example.com',
			])

			expect(rows[0].count).toBe(3)
		})

		it('lets a try through once the wait is over', async () => {
			await repo.countFailedLogin('guess@example.com', 1, 60)

			await pool.query(
				`UPDATE failed_logins SET last_failed_at = now() - interval '61 seconds' WHERE email = $1`,
				['guess@example.com'],
			)

			expect(await repo.countFailedLogin('guess@example.com', 1, 60)).toBe(true)

			expect(await repo.countFailedLogin('guess@example.com', 1, 60)).toBe(false)
		})

		it('counts each email apart', async () => {
			await repo.countFailedLogin('one@example.com', 1, 60)

			expect(await repo.countFailedLogin('two@example.com', 1, 60)).toBe(true)
		})

		it('starts over after clearFailedLogins', async () => {
			await repo.countFailedLogin('guess@example.com', 1, 60)

			await repo.clearFailedLogins('guess@example.com')

			expect(await repo.countFailedLogin('guess@example.com', 1, 60)).toBe(true)
		})
	})

	describe('deleteStaleFailedLogins', () => {
		it('deletes only counts older than the given age', async () => {
			await repo.countFailedLogin('old@example.com', 5, 60)

			await repo.countFailedLogin('new@example.com', 5, 60)

			await pool.query(
				`UPDATE failed_logins SET last_failed_at = now() - interval '2 days' WHERE email = $1`,
				['old@example.com'],
			)

			expect(await repo.deleteStaleFailedLogins(24 * 60 * 60)).toBe(1)

			const { rows } = await pool.query('SELECT email FROM failed_logins')

			expect(rows).toEqual([{ email: 'new@example.com' }])
		})
	})
	describe('countSignUp', () => {
		it('counts sign-ups up to the limit, then refuses the next', async () => {
			for (let i = 0; i < 3; i++) {
				expect(await repo.countSignUp('1.2.3.4', 3)).toBe(true)
			}

			expect(await repo.countSignUp('1.2.3.4', 3)).toBe(false)

			const { rows } = await pool.query('SELECT count(*)::int AS count FROM sign_ups')

			expect(rows[0].count).toBe(3)
		})

		it('counts each IPv4 address apart', async () => {
			await repo.countSignUp('1.2.3.4', 1)

			expect(await repo.countSignUp('1.2.3.5', 1)).toBe(true)
		})

		it('counts IPv6 addresses in one /64 together', async () => {
			await repo.countSignUp('2001:db8:1:2::1', 1)

			expect(await repo.countSignUp('2001:db8:1:2:ffff::9', 1)).toBe(false)

			expect(await repo.countSignUp('2001:db8:1:3::1', 1)).toBe(true)
		})

		it('lets a sign-up through once the oldest is a day old', async () => {
			await repo.countSignUp('1.2.3.4', 1)

			await pool.query(`UPDATE sign_ups SET created_at = now() - interval '1 day'`)

			expect(await repo.countSignUp('1.2.3.4', 1)).toBe(true)
		})
	})

	describe('deleteOldSignUps', () => {
		it('deletes only counts a day old', async () => {
			await repo.countSignUp('1.2.3.4', 5)

			await repo.countSignUp('5.6.7.8', 5)

			await pool.query(
				`UPDATE sign_ups SET created_at = now() - interval '2 days' WHERE network = '1.2.3.4'`,
			)

			expect(await repo.deleteOldSignUps()).toBe(1)

			const { rows } = await pool.query('SELECT network FROM sign_ups')

			expect(rows).toEqual([{ network: '5.6.7.8/32' }])
		})
	})
})
