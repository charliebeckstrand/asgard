import type { Mock } from 'vitest'
import { createDatabaseClient } from '../db.js'
import { sql } from '../sql.js'

function createMockPool(queryResult: { rows: unknown[]; rowCount?: number }) {
	return {
		query: vi.fn().mockResolvedValue(queryResult),
		connect: vi.fn(),
	} as unknown as Parameters<typeof createDatabaseClient>[0]
}

function createMockClient(queryResult: { rows: unknown[]; rowCount?: number }) {
	return {
		query: vi.fn().mockResolvedValue(queryResult),
		release: vi.fn(),
	}
}

describe('createDatabaseClient', () => {
	describe('first', () => {
		it('returns the first row', async () => {
			const pool = createMockPool({ rows: [{ id: 1, name: 'Alice' }] })

			const db = createDatabaseClient(pool)

			const result = await db.first<{ id: number; name: string }>(
				sql`
					SELECT *
					FROM users
					WHERE id = ${1}
				`,
			)

			expect(result).toEqual({ id: 1, name: 'Alice' })
		})

		it('returns null when no rows', async () => {
			const pool = createMockPool({ rows: [] })

			const db = createDatabaseClient(pool)

			const result = await db.first(sql`
				SELECT *
				FROM users
				WHERE id = ${999}
			`)

			expect(result).toBeNull()
		})
	})

	describe('one', () => {
		it('returns the first row', async () => {
			const pool = createMockPool({ rows: [{ id: 1 }] })

			const db = createDatabaseClient(pool)

			const result = await db.one<{ id: number }>(sql`
				INSERT INTO t (v)
				VALUES (${1})
				RETURNING id
			`)

			expect(result).toEqual({ id: 1 })
		})

		it('throws NoRowsError with query text when no rows', async () => {
			const pool = createMockPool({ rows: [] })

			const db = createDatabaseClient(pool)

			await expect(
				db.one(sql`
					SELECT *
					FROM t
					WHERE id = ${999}
				`),
			).rejects.toThrow('Expected at least one row, but got none: SELECT * FROM t WHERE id = $1')
		})
	})

	describe('many', () => {
		it('returns all rows', async () => {
			const rows = [
				{ id: 1, name: 'Alice' },
				{ id: 2, name: 'Bob' },
			]

			const pool = createMockPool({ rows })

			const db = createDatabaseClient(pool)

			const result = await db.many<{ id: number; name: string }>(sql`
				SELECT *
				FROM users
			`)

			expect(result).toEqual(rows)
		})

		it('returns empty array when no rows', async () => {
			const pool = createMockPool({ rows: [] })

			const db = createDatabaseClient(pool)

			const result = await db.many(sql`
				SELECT *
				FROM users
			`)

			expect(result).toEqual([])
		})
	})

	describe('exec', () => {
		it('returns row count', async () => {
			const pool = createMockPool({ rows: [], rowCount: 3 })

			const db = createDatabaseClient(pool)

			const result = await db.exec(sql`
				DELETE FROM users
				WHERE active = ${false}
			`)

			expect(result).toBe(3)
		})

		it('returns 0 when rowCount is null', async () => {
			const pool = createMockPool({ rows: [], rowCount: undefined })

			const db = createDatabaseClient(pool)

			const result = await db.exec(sql`
				DELETE FROM users
				WHERE id = ${999}
			`)

			expect(result).toBe(0)
		})
	})

	describe('val', () => {
		it('returns the first column of the first row', async () => {
			const pool = createMockPool({ rows: [{ count: 42 }] })

			const db = createDatabaseClient(pool)

			const result = await db.val<number>(sql`
				SELECT COUNT(*)::int
				FROM users
			`)

			expect(result).toBe(42)
		})

		it('throws NoRowsError with query text when no rows', async () => {
			const pool = createMockPool({ rows: [] })

			const db = createDatabaseClient(pool)

			await expect(
				db.val(sql`
					SELECT COUNT(*)
					FROM users
				`),
			).rejects.toThrow('Expected at least one row, but got none: SELECT COUNT(*) FROM users')
		})
	})

	describe('tx', () => {
		it('commits on success', async () => {
			const client = createMockClient({ rows: [{ id: 1 }] })

			const pool = createMockPool({ rows: [] })

			;(pool.connect as Mock).mockResolvedValue(client)

			const db = createDatabaseClient(pool)

			const result = await db.tx(async (tx) => {
				return tx.one<{ id: number }>(sql`
					INSERT INTO t (v)
					VALUES (${1})
					RETURNING id
				`)
			})

			expect(result).toEqual({ id: 1 })

			const calls = (client.query as Mock).mock.calls

			expect(calls[0][0]).toBe('BEGIN')

			expect(calls[calls.length - 1][0]).toBe('COMMIT')

			expect(client.release).toHaveBeenCalled()
		})

		it('rolls back on error', async () => {
			const client = createMockClient({ rows: [] })

			const pool = createMockPool({ rows: [] })

			;(pool.connect as Mock).mockResolvedValue(client)

			const db = createDatabaseClient(pool)

			await expect(
				db.tx(async () => {
					throw new Error('boom')
				}),
			).rejects.toThrow('boom')

			const calls = (client.query as Mock).mock.calls

			expect(calls[0][0]).toBe('BEGIN')

			expect(calls[calls.length - 1][0]).toBe('ROLLBACK')

			expect(client.release).toHaveBeenCalled()
		})

		it('releases client even when rollback fails', async () => {
			const client = createMockClient({ rows: [] })

			;(client.query as Mock)
				.mockResolvedValueOnce({}) // BEGIN
				.mockRejectedValueOnce(new Error('query error')) // tx query
				.mockRejectedValueOnce(new Error('rollback error')) // ROLLBACK

			const pool = createMockPool({ rows: [] })

			;(pool.connect as Mock).mockResolvedValue(client)

			const db = createDatabaseClient(pool)

			await expect(
				db.tx(async (tx) => {
					await tx.many(sql`
						SELECT *
						FROM bad_table
					`)
				}),
			).rejects.toThrow()

			expect(client.release).toHaveBeenCalled()
		})
	})

	describe('ping', () => {
		it('returns true when database is reachable', async () => {
			const pool = createMockPool({ rows: [{ '?column?': 1 }] })

			const db = createDatabaseClient(pool)

			const result = await db.ping()

			expect(result).toBe(true)
		})

		it('returns false when database is unreachable', async () => {
			const pool = createMockPool({ rows: [] })

			;(pool.query as Mock).mockRejectedValue(new Error('connection refused'))

			const db = createDatabaseClient(pool)

			const result = await db.ping()

			expect(result).toBe(false)
		})
	})
})
