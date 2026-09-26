const { pool, Pool } = vi.hoisted(() => {
	const pool = { query: vi.fn(), connect: vi.fn(), on: vi.fn(), end: vi.fn() }

	// Every Pool instance shares these mocks, so a test can stub them before the pool exists.
	const Pool = vi.fn(function (this: object) {
		Object.assign(this, pool)
	})

	return { pool, Pool }
})

vi.mock('pg', () => ({ Pool }))

import { createDb, type DbConfig, NoRowsError } from '../db.js'
import type { Logger } from '../log/index.js'
import { sql } from '../sql.js'

const url = 'postgres://user:pass@host:5432/db'

function createClient() {
	return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: vi.fn() }
}

function idleErrorHandler(): (err: Error) => void {
	const call = pool.on.mock.calls.find(([event]) => event === 'error')

	return call?.[1]
}

describe('createDb', () => {
	beforeEach(() => {
		vi.clearAllMocks()

		pool.query.mockResolvedValue({ rows: [], rowCount: 0 })
	})

	describe('first', () => {
		it('returns the first row, passing the query text and values to the pool', async () => {
			pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'Alice' }] })

			const db = createDb(() => ({ url }))

			const result = await db.first<{ id: number; name: string }>(sql`
				SELECT *
				FROM users
				WHERE id = ${1}
			`)

			expect(result).toEqual({ id: 1, name: 'Alice' })

			expect(pool.query).toHaveBeenCalledWith({
				text: 'SELECT * FROM users WHERE id = $1',
				values: [1],
			})
		})

		it('returns null when there are no rows', async () => {
			const db = createDb(() => ({ url }))

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
			pool.query.mockResolvedValue({ rows: [{ id: 1 }] })

			const db = createDb(() => ({ url }))

			const result = await db.one<{ id: number }>(sql`
				INSERT INTO t (v)
				VALUES (${1})
				RETURNING id
			`)

			expect(result).toEqual({ id: 1 })
		})

		it('throws NoRowsError naming the query when there are no rows', async () => {
			const db = createDb(() => ({ url }))

			const result = db.one(sql`
				SELECT *
				FROM t
				WHERE id = ${999}
			`)

			await expect(result).rejects.toThrow(NoRowsError)

			await expect(result).rejects.toThrow(
				'Expected at least one row, but got none: SELECT * FROM t WHERE id = $1',
			)
		})
	})

	describe('many', () => {
		it('returns all rows', async () => {
			const rows = [
				{ id: 1, name: 'Alice' },
				{ id: 2, name: 'Bob' },
			]

			pool.query.mockResolvedValue({ rows })

			const db = createDb(() => ({ url }))

			const result = await db.many(sql`
				SELECT *
				FROM users
			`)

			expect(result).toEqual(rows)
		})

		it('returns an empty array when there are no rows', async () => {
			const db = createDb(() => ({ url }))

			const result = await db.many(sql`
				SELECT *
				FROM users
			`)

			expect(result).toEqual([])
		})
	})

	describe('exec', () => {
		it('returns the row count', async () => {
			pool.query.mockResolvedValue({ rows: [], rowCount: 3 })

			const db = createDb(() => ({ url }))

			const result = await db.exec(sql`
				DELETE FROM users
				WHERE active = ${false}
			`)

			expect(result).toBe(3)
		})

		it('returns 0 when the row count is null', async () => {
			pool.query.mockResolvedValue({ rows: [], rowCount: null })

			const db = createDb(() => ({ url }))

			const result = await db.exec(sql`
				DELETE FROM users
				WHERE id = ${999}
			`)

			expect(result).toBe(0)
		})
	})

	describe('val', () => {
		it('returns the first column of the first row', async () => {
			pool.query.mockResolvedValue({ rows: [{ count: 42 }] })

			const db = createDb(() => ({ url }))

			const result = await db.val<number>(sql`
				SELECT COUNT(*)::int
				FROM users
			`)

			expect(result).toBe(42)
		})

		it('throws NoRowsError naming the query when there are no rows', async () => {
			const db = createDb(() => ({ url }))

			await expect(
				db.val(sql`
					SELECT COUNT(*)
					FROM users
				`),
			).rejects.toThrow('Expected at least one row, but got none: SELECT COUNT(*) FROM users')
		})
	})

	describe('pool', () => {
		it('is not created, and config is not read, until the first query', async () => {
			const config = vi.fn((): DbConfig => ({ url }))

			const db = createDb(config)

			expect(config).not.toHaveBeenCalled()

			expect(Pool).not.toHaveBeenCalled()

			await db.many(sql`SELECT 1`)

			expect(config).toHaveBeenCalledOnce()

			expect(Pool).toHaveBeenCalledOnce()
		})

		it('is reused across queries', async () => {
			const db = createDb(() => ({ url }))

			await db.many(sql`SELECT 1`)

			await db.many(sql`SELECT 2`)

			expect(Pool).toHaveBeenCalledOnce()
		})

		it('connects with the URL parts and default pool options', async () => {
			const db = createDb(() => ({ url }))

			await db.ping()

			expect(Pool).toHaveBeenCalledWith({
				host: 'host',
				port: 5432,
				database: 'db',
				user: 'user',
				password: 'pass',
				ssl: false,
				max: 5,
				idleTimeoutMillis: 30_000,
				connectionTimeoutMillis: 5_000,
			})
		})

		it('uses the pool options from config', async () => {
			const db = createDb(() => ({
				url,
				max: 20,
				idleTimeoutMillis: 60_000,
				connectionTimeoutMillis: 10_000,
			}))

			await db.ping()

			expect(Pool).toHaveBeenCalledWith(
				expect.objectContaining({
					max: 20,
					idleTimeoutMillis: 60_000,
					connectionTimeoutMillis: 10_000,
				}),
			)
		})

		it('logs idle client errors to the logger', async () => {
			const logger = { error: vi.fn() }

			const db = createDb(() => ({ url, logger: logger as unknown as Logger }))

			await db.ping()

			const err = new Error('boom')

			idleErrorHandler()(err)

			expect(logger.error).toHaveBeenCalledWith({ err }, 'idle client error')
		})

		it('logs idle client errors to the console without a logger', async () => {
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

			const db = createDb(() => ({ url }))

			await db.ping()

			idleErrorHandler()(new Error('boom'))

			expect(consoleError).toHaveBeenCalledWith('[saga] idle client error:', 'boom')

			consoleError.mockRestore()
		})
	})

	describe('tx', () => {
		it('commits and returns the result when the callback resolves', async () => {
			const client = createClient()

			client.query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 })

			pool.connect.mockResolvedValue(client)

			const db = createDb(() => ({ url }))

			const result = await db.tx((tx) =>
				tx.one<{ id: number }>(sql`
					INSERT INTO t (v)
					VALUES (${1})
					RETURNING id
				`),
			)

			expect(result).toEqual({ id: 1 })

			expect(client.query.mock.calls.map(([query]) => query)).toEqual([
				'BEGIN',
				{ text: 'INSERT INTO t (v) VALUES ($1) RETURNING id', values: [1] },
				'COMMIT',
			])

			expect(client.release).toHaveBeenCalledWith(undefined)
		})

		it('rolls back, rethrows and releases the client when the callback throws', async () => {
			const client = createClient()

			pool.connect.mockResolvedValue(client)

			const db = createDb(() => ({ url }))

			const result = db.tx(async () => {
				throw new Error('boom')
			})

			await expect(result).rejects.toThrow('boom')

			expect(client.query.mock.calls.map(([query]) => query)).toEqual(['BEGIN', 'ROLLBACK'])

			expect(client.release).toHaveBeenCalledWith(undefined)
		})

		it('rethrows the original error and releases the client as broken when ROLLBACK fails', async () => {
			const client = createClient()

			const rollbackError = new Error('rollback error')

			client.query
				.mockResolvedValueOnce({}) // BEGIN
				.mockRejectedValueOnce(new Error('query error'))
				.mockRejectedValueOnce(rollbackError) // ROLLBACK

			pool.connect.mockResolvedValue(client)

			const db = createDb(() => ({ url }))

			const result = db.tx((tx) => tx.many(sql`SELECT * FROM bad_table`))

			await expect(result).rejects.toThrow('query error')

			expect(client.release).toHaveBeenCalledWith(rollbackError)
		})
	})

	describe('ping', () => {
		it('returns true when the database answers', async () => {
			pool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })

			const db = createDb(() => ({ url }))

			const result = await db.ping()

			expect(result).toBe(true)
		})

		it('returns false when the query fails', async () => {
			pool.query.mockRejectedValue(new Error('connection refused'))

			const db = createDb(() => ({ url }))

			const result = await db.ping()

			expect(result).toBe(false)
		})
	})

	describe('close', () => {
		it('ends the pool, and a later query opens a new one', async () => {
			const db = createDb(() => ({ url }))

			await db.ping()

			await db.close()

			expect(pool.end).toHaveBeenCalledOnce()

			await db.ping()

			expect(Pool).toHaveBeenCalledTimes(2)
		})

		it('does nothing when no pool was opened', async () => {
			const db = createDb(() => ({ url }))

			await db.close()

			expect(pool.end).not.toHaveBeenCalled()
		})
	})
})
