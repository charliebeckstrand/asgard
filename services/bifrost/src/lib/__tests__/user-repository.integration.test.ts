import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { createDb, type Db, migrate } from 'saga'
import { isDockerAvailable, startPostgres, type TestDatabase } from 'vali/containers'
import { stubServiceEnv } from 'vali/env'
import type { UserRepository } from '../../auth/types.js'

stubServiceEnv()

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

let testDb: TestDatabase
let pool: Pool
let db: Db
let repo: UserRepository

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startPostgres()

	pool = new Pool({ connectionString: testDb.connectionUri })

	await migrate({ url: testDb.connectionUri }, migrationsDir)

	db = createDb(() => ({ url: testDb.connectionUri }))

	vi.doMock('../db.js', () => ({ db }))

	const mod = await import('../user-repository.js')

	repo = mod.createUserRepository()
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

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('createUserRepository (integration)', () => {
	describe('insertUser + getUserById', () => {
		it('inserts and retrieves a user', async () => {
			const id = randomUUID()

			const inserted = await repo.insertUser(id, 'alice@example.com', 'hash')

			expect(inserted.id).toBe(id)

			expect(inserted.email).toBe('alice@example.com')

			expect(inserted.is_active).toBe(true)

			expect(inserted.is_verified).toBe(false)

			expect(inserted.role).toBe('user')

			const fetched = await repo.getUserById(id)

			expect(fetched).not.toBeNull()

			expect(fetched?.email).toBe('alice@example.com')
		})

		it('returns null for an unknown id', async () => {
			expect(await repo.getUserById(randomUUID())).toBeNull()
		})

		it('rejects duplicate emails via unique index', async () => {
			await repo.insertUser(randomUUID(), 'dup@example.com', 'hash')

			await expect(repo.insertUser(randomUUID(), 'dup@example.com', 'hash')).rejects.toThrow()
		})
	})

	describe('getCredentialsByEmail', () => {
		it('returns credentials for an existing user', async () => {
			const id = randomUUID()

			await repo.insertUser(id, 'creds@example.com', 'hashed-pw')

			const creds = await repo.getCredentialsByEmail('creds@example.com')

			expect(creds).toEqual({
				id,
				hashed_password: 'hashed-pw',
				is_active: true,
			})
		})

		it('returns null when the email is unknown', async () => {
			expect(await repo.getCredentialsByEmail('nobody@example.com')).toBeNull()
		})
	})

	describe('getUsers', () => {
		it('returns all users ordered by created_at', async () => {
			const ids = [randomUUID(), randomUUID(), randomUUID()]

			await repo.insertUser(ids[0], 'a@example.com', 'h')

			await new Promise((r) => setTimeout(r, 5))

			await repo.insertUser(ids[1], 'b@example.com', 'h')

			await new Promise((r) => setTimeout(r, 5))

			await repo.insertUser(ids[2], 'c@example.com', 'h')

			const users = await repo.getUsers()

			expect(users.map((u) => u.email)).toEqual(['a@example.com', 'b@example.com', 'c@example.com'])
		})

		it('returns an empty array when no users exist', async () => {
			expect(await repo.getUsers()).toEqual([])
		})
	})

	describe('setUserActive', () => {
		it('updates is_active and refreshes updated_at', async () => {
			const id = randomUUID()

			const before = await repo.insertUser(id, 'flip@example.com', 'h')

			const after = await repo.setUserActive(id, false)

			expect(after?.is_active).toBe(false)

			expect(new Date(after?.updated_at as string).getTime()).toBeGreaterThan(
				new Date(before.updated_at).getTime(),
			)
		})

		it('leaves admins alone', async () => {
			const id = randomUUID()

			await repo.insertUser(id, 'admin@example.com', 'h')

			await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [id])

			expect(await repo.setUserActive(id, false)).toBeNull()

			expect((await repo.getUserById(id))?.is_active).toBe(true)
		})

		it('returns null for a missing user', async () => {
			expect(await repo.setUserActive(randomUUID(), false)).toBeNull()
		})
	})
})
