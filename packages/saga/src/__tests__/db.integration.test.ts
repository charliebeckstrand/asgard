import { isDockerAvailable, startPostgres, type TestDatabase } from 'vali/containers'
import { createDb, type Db, NoRowsError } from '../db.js'
import { sql } from '../sql.js'

let testDb: TestDatabase
let db: Db

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startPostgres()

	db = createDb(() => ({ url: testDb.connectionUri }))

	await db.exec(sql`
		CREATE TABLE users (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT,
			active BOOLEAN DEFAULT true
		)
	`)

	await db.exec(sql`
		INSERT INTO users (name, email) VALUES
		('Alice', 'alice@example.com'),
		('Bob', 'bob@example.com')
	`)
}, 60_000)

afterAll(async () => {
	await db?.close()

	await testDb?.stop()
})

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('createDb (integration)', () => {
	describe('first', () => {
		it('returns the first row from a real database', async () => {
			const result = await db.first<{ id: number; name: string; email: string }>(
				sql`
					SELECT *
					FROM users
					WHERE name = ${'Alice'}
				`,
			)

			expect(result).not.toBeNull()

			expect(result?.name).toBe('Alice')

			expect(result?.email).toBe('alice@example.com')
		})

		it('returns null when no rows match', async () => {
			const result = await db.first(sql`
				SELECT *
				FROM users
				WHERE name = ${'Nobody'}
			`)

			expect(result).toBeNull()
		})
	})

	describe('one', () => {
		it('returns the first row', async () => {
			const result = await db.one<{ id: number; name: string }>(sql`
				SELECT *
				FROM users
				WHERE name = ${'Alice'}
			`)

			expect(result.name).toBe('Alice')
		})

		it('throws NoRowsError when no rows match', async () => {
			await expect(
				db.one(sql`
					SELECT *
					FROM users
					WHERE name = ${'Nobody'}
				`),
			).rejects.toThrow(NoRowsError)
		})
	})

	describe('many', () => {
		it('returns all matching rows', async () => {
			const result = await db.many<{ id: number; name: string }>(sql`
				SELECT *
				FROM users
				ORDER BY id
			`)

			expect(result).toHaveLength(2)

			expect(result[0].name).toBe('Alice')

			expect(result[1].name).toBe('Bob')
		})

		it('returns empty array when no rows match', async () => {
			const result = await db.many(sql`
				SELECT *
				FROM users
				WHERE active = ${false}
			`)

			expect(result).toEqual([])
		})
	})

	describe('exec', () => {
		it('returns affected row count', async () => {
			await db.exec(sql`INSERT INTO users (name) VALUES (${'Temp'})`)

			const result = await db.exec(sql`
				DELETE FROM users
				WHERE name = ${'Temp'}
			`)

			expect(result).toBe(1)
		})

		it('returns 0 when no rows affected', async () => {
			const result = await db.exec(sql`
				DELETE FROM users
				WHERE name = ${'Nobody'}
			`)

			expect(result).toBe(0)
		})
	})

	describe('val', () => {
		it('returns scalar value', async () => {
			const result = await db.val<number>(sql`
				SELECT COUNT(*)::int
				FROM users
			`)

			expect(result).toBe(2)
		})

		it('throws NoRowsError on empty result', async () => {
			await expect(
				db.val(sql`
					SELECT id
					FROM users
					WHERE name = ${'Nobody'}
				`),
			).rejects.toThrow(NoRowsError)
		})
	})

	describe('tx', () => {
		it('commits on success', async () => {
			const result = await db.tx(async (tx) => {
				return tx.one<{ id: number }>(sql`
					INSERT INTO users (name, email)
					VALUES (${'Charlie'}, ${'charlie@example.com'})
					RETURNING id
				`)
			})

			expect(result.id).toBeTypeOf('number')

			const check = await db.first<{ name: string }>(sql`
				SELECT name
				FROM users
				WHERE id = ${result.id}
			`)

			expect(check?.name).toBe('Charlie')

			// Cleanup
			await db.exec(sql`DELETE FROM users WHERE id = ${result.id}`)
		})

		it('rolls back on error', async () => {
			const countBefore = await db.val<number>(sql`
				SELECT COUNT(*)::int
				FROM users
			`)

			await expect(
				db.tx(async (tx) => {
					await tx.exec(sql`
						INSERT INTO users (name)
						VALUES (${'RollbackTest'})
					`)

					throw new Error('boom')
				}),
			).rejects.toThrow('boom')

			const countAfter = await db.val<number>(sql`
				SELECT COUNT(*)::int
				FROM users
			`)

			expect(countAfter).toBe(countBefore)
		})
	})
})
