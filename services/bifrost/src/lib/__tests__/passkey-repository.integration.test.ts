import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { isDockerAvailable } from 'vali/containers'
import type { PasskeyRepository, UserRepository } from '../../auth/types.js'
import { demote, promote } from '../admins.js'
import { createPasskeyRepository } from '../passkey-repository.js'
import { createUserRepository } from '../user-repository.js'
import { startTestDb, type TestDb } from './test-db.js'

let testDb: TestDb
let pool: Pool
let users: UserRepository
let passkeys: PasskeyRepository

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startTestDb()

	pool = testDb.pool

	users = createUserRepository(testDb.db)

	passkeys = createPasskeyRepository(testDb.db)
}, 60_000)

afterAll(async () => {
	await testDb?.stop()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await testDb.reset()
})

const inAMinute = () => new Date(Date.now() + 60_000)

async function insertUser(email = `${randomUUID()}@x.dev`) {
	return (await users.insertUser(email, 'h')).id
}

async function addPasskey(userId: string, id = randomUUID()) {
	await passkeys.insertPasskey(userId, {
		id,
		publicKey: new Uint8Array([1, 2, 3]),
		counter: 0,
		transports: ['internal', 'hybrid'],
	})

	return id
}

async function verify(userId: string) {
	await pool.query('UPDATE users SET is_verified = true WHERE id = $1', [userId])
}

async function makeAdmin(userId: string) {
	await pool.query("UPDATE users SET roles = '{user,admin}' WHERE id = $1", [userId])
}

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('createPasskeyRepository (integration)', () => {
	describe('passkeys', () => {
		it('stores a passkey and reads it back whole', async () => {
			const userId = await insertUser()

			const id = await addPasskey(userId)

			const stored = await passkeys.findPasskey(id)

			expect(stored).toMatchObject({
				id,
				user_id: userId,
				counter: 0,
				transports: ['internal', 'hybrid'],
			})

			expect(stored?.public_key).toEqual(new Uint8Array([1, 2, 3]))
		})

		it('lists only the passkeys of the user', async () => {
			const userId = await insertUser()

			const mine = await addPasskey(userId)

			await addPasskey(await insertUser())

			expect((await passkeys.getPasskeys(userId)).map((p) => p.id)).toEqual([mine])
		})

		it('stores the counter as a number', async () => {
			const id = await addPasskey(await insertUser())

			await passkeys.setCounter(id, 7)

			expect((await passkeys.findPasskey(id))?.counter).toBe(7)
		})

		it('rejects a credential ID that is already registered', async () => {
			const id = await addPasskey(await insertUser())

			await expect(addPasskey(await insertUser(), id)).rejects.toThrow()
		})
	})

	describe('deletePasskey', () => {
		it("deletes the user's passkey", async () => {
			const userId = await insertUser()

			const id = await addPasskey(userId)

			expect(await passkeys.deletePasskey(id, userId)).toBe('deleted')

			expect(await passkeys.findPasskey(id)).toBeNull()
		})

		it("won't delete another user's passkey", async () => {
			const id = await addPasskey(await insertUser())

			expect(await passkeys.deletePasskey(id, await insertUser())).toBe('not_found')

			expect(await passkeys.findPasskey(id)).not.toBeNull()
		})

		it("keeps an admin's last passkey", async () => {
			const adminId = await insertUser()

			const id = await addPasskey(adminId)

			await makeAdmin(adminId)

			expect(await passkeys.deletePasskey(id, adminId)).toBe('last_admin_factor')

			expect(await passkeys.findPasskey(id)).not.toBeNull()
		})

		it('lets an admin delete one passkey of several', async () => {
			const adminId = await insertUser()

			const id = await addPasskey(adminId)

			await addPasskey(adminId)

			await makeAdmin(adminId)

			expect(await passkeys.deletePasskey(id, adminId)).toBe('deleted')
		})

		it('keeps one passkey when an admin deletes two at once', async () => {
			const adminId = await insertUser()

			const ids = [await addPasskey(adminId), await addPasskey(adminId)]

			await makeAdmin(adminId)

			const results = await Promise.all(ids.map((id) => passkeys.deletePasskey(id, adminId)))

			expect(results.sort()).toEqual(['deleted', 'last_admin_factor'])

			expect(await passkeys.getPasskeys(adminId)).toHaveLength(1)
		})

		it('deletes the passkeys with their user', async () => {
			const userId = await insertUser()

			const id = await addPasskey(userId)

			await pool.query('DELETE FROM users WHERE id = $1', [userId])

			expect(await passkeys.findPasskey(id)).toBeNull()
		})
	})

	describe('challenges', () => {
		it('uses a sign-in challenge once', async () => {
			await passkeys.createChallenge('c1', null, inAMinute())

			expect(await passkeys.useChallenge('c1', null)).toBe(true)

			expect(await passkeys.useChallenge('c1', null)).toBe(false)
		})

		it('uses a registration challenge only for its user', async () => {
			const userId = await insertUser()

			await passkeys.createChallenge('c1', userId, inAMinute())

			expect(await passkeys.useChallenge('c1', null)).toBe(false)

			expect(await passkeys.useChallenge('c1', await insertUser())).toBe(false)

			expect(await passkeys.useChallenge('c1', userId)).toBe(true)
		})

		it("won't use a registration challenge to sign in, or the reverse", async () => {
			const userId = await insertUser()

			await passkeys.createChallenge('sign-in', null, inAMinute())

			expect(await passkeys.useChallenge('sign-in', userId)).toBe(false)
		})

		it('ignores an expired challenge and sweeps it', async () => {
			await passkeys.createChallenge('old', null, new Date(Date.now() - 1000))

			await passkeys.createChallenge('live', null, inAMinute())

			expect(await passkeys.useChallenge('old', null)).toBe(false)

			expect(await passkeys.deleteExpiredChallenges()).toBe(1)

			expect(await passkeys.useChallenge('live', null)).toBe(true)
		})
	})
})

describeWithDocker('admins (integration)', () => {
	async function roles(userId: string) {
		return (await users.getUserById(userId))?.roles
	}

	it('promotes a user who has a passkey, and ends their sessions', async () => {
		const userId = await insertUser('alice@x.dev')

		await verify(userId)

		await addPasskey(userId)

		await pool.query(
			"INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', $1, now() + interval '1 day')",
			[userId],
		)

		expect(await promote(testDb.db, ' Alice@X.dev ')).toBe('promoted')

		expect(await roles(userId)).toEqual(['user', 'admin'])

		const { rows } = await pool.query('SELECT 1 FROM sessions WHERE user_id = $1', [userId])

		expect(rows).toHaveLength(0)
	})

	it('adds the admin role only once', async () => {
		const userId = await insertUser('dan@x.dev')

		await verify(userId)

		await addPasskey(userId)

		await promote(testDb.db, 'dan@x.dev')

		await promote(testDb.db, 'dan@x.dev')

		expect(await roles(userId)).toEqual(['user', 'admin'])
	})

	it("won't promote a user without a second factor", async () => {
		const userId = await insertUser('bob@x.dev')

		await verify(userId)

		expect(await promote(testDb.db, 'bob@x.dev')).toBe('no_second_factor')

		expect(await roles(userId)).toEqual(['user'])
	})

	it("won't promote a user who hasn't verified their email", async () => {
		const userId = await insertUser('erin@x.dev')

		await addPasskey(userId)

		expect(await promote(testDb.db, 'erin@x.dev')).toBe('unverified')

		expect(await roles(userId)).toEqual(['user'])
	})

	it('reports an unknown email', async () => {
		expect(await promote(testDb.db, 'nobody@x.dev')).toBe('not_found')

		expect(await demote(testDb.db, 'nobody@x.dev')).toBe('not_found')
	})

	it('demotes an admin', async () => {
		const userId = await insertUser('carol@x.dev')

		await makeAdmin(userId)

		expect(await demote(testDb.db, 'carol@x.dev')).toBe('demoted')

		expect(await roles(userId)).toEqual(['user'])
	})
})
