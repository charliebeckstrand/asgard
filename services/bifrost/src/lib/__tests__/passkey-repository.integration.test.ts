import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { createDb, type Db, migrate } from 'saga'
import { isDockerAvailable, startPostgres, type TestDatabase } from 'vali/containers'
import { stubServiceEnv } from 'vali/env'
import type { PasskeyRepository, UserRepository } from '../../auth/types.js'

stubServiceEnv()

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

let testDb: TestDatabase
let pool: Pool
let db: Db
let users: UserRepository
let passkeys: PasskeyRepository
let admins: typeof import('../admins.js')

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startPostgres()

	pool = new Pool({ connectionString: testDb.connectionUri })

	await migrate({ url: testDb.connectionUri }, migrationsDir)

	db = createDb(() => ({ url: testDb.connectionUri }))

	vi.doMock('../db.js', () => ({ db }))

	users = (await import('../user-repository.js')).createUserRepository()

	passkeys = (await import('../passkey-repository.js')).createPasskeyRepository()

	admins = await import('../admins.js')
}, 60_000)

afterAll(async () => {
	await db?.close()

	await pool?.end()

	await testDb?.stop()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await pool.query('TRUNCATE users, challenges CASCADE')
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

async function makeAdmin(userId: string) {
	await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId])
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

			expect(await passkeys.deletePasskey(id, adminId)).toBe('last_admin_passkey')

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

			expect(results.sort()).toEqual(['deleted', 'last_admin_passkey'])

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
	async function role(userId: string) {
		return (await users.getUserById(userId))?.role
	}

	it('promotes a user who has a passkey, and ends their sessions', async () => {
		const userId = await insertUser('alice@x.dev')

		await addPasskey(userId)

		await pool.query(
			"INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', $1, now() + interval '1 day')",
			[userId],
		)

		expect(await admins.promote(' Alice@X.dev ')).toBe('promoted')

		expect(await role(userId)).toBe('admin')

		const { rows } = await pool.query('SELECT 1 FROM sessions WHERE user_id = $1', [userId])

		expect(rows).toHaveLength(0)
	})

	it("won't promote a user without a passkey", async () => {
		const userId = await insertUser('bob@x.dev')

		expect(await admins.promote('bob@x.dev')).toBe('no_passkey')

		expect(await role(userId)).toBe('user')
	})

	it('reports an unknown email', async () => {
		expect(await admins.promote('nobody@x.dev')).toBe('not_found')

		expect(await admins.demote('nobody@x.dev')).toBe('not_found')
	})

	it('demotes an admin', async () => {
		const userId = await insertUser('carol@x.dev')

		await makeAdmin(userId)

		expect(await admins.demote('carol@x.dev')).toBe('demoted')

		expect(await role(userId)).toBe('user')
	})
})
