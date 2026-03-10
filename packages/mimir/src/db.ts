import type { Pool, PoolClient, QueryResultRow } from 'pg'
import type { SqlFragment } from './sql.js'

export class NoRowsError extends Error {
	constructor(message = 'Expected at least one row, but got none') {
		super(message)

		this.name = 'NoRowsError'
	}
}

export interface Queryable {
	one<T extends QueryResultRow>(fragment: SqlFragment): Promise<T | null>
	first<T extends QueryResultRow>(fragment: SqlFragment): Promise<T>
	many<T extends QueryResultRow>(fragment: SqlFragment): Promise<T[]>
	exec(fragment: SqlFragment): Promise<number>
	val<T>(fragment: SqlFragment): Promise<T>
}

export interface Db extends Queryable {
	tx<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
	pool: Pool
}

function createQueryable(executor: { query: Pool['query'] | PoolClient['query'] }): Queryable {
	return {
		async one<T extends QueryResultRow>(fragment: SqlFragment): Promise<T | null> {
			const { rows } = await executor.query<T>(fragment as never)

			return rows[0] ?? null
		},

		async first<T extends QueryResultRow>(fragment: SqlFragment): Promise<T> {
			const { rows } = await executor.query<T>(fragment as never)

			if (rows.length === 0) {
				throw new NoRowsError()
			}

			return rows[0]
		},

		async many<T extends QueryResultRow>(fragment: SqlFragment): Promise<T[]> {
			const { rows } = await executor.query<T>(fragment as never)

			return rows
		},

		async exec(fragment: SqlFragment): Promise<number> {
			const { rowCount } = await executor.query(fragment as never)

			return rowCount ?? 0
		},

		async val<T>(fragment: SqlFragment): Promise<T> {
			const { rows } = await executor.query<Record<string, T>>(fragment as never)

			if (rows.length === 0) {
				throw new NoRowsError()
			}

			const firstRow = rows[0]
			const keys = Object.keys(firstRow)

			return firstRow[keys[0]]
		},
	}
}

export function createDb(pool: Pool): Db {
	const queryable = createQueryable(pool)

	return {
		...queryable,
		pool,

		async tx<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
			const client = await pool.connect()

			try {
				await client.query('BEGIN')

				const tx = createQueryable(client)
				const result = await fn(tx)

				await client.query('COMMIT')

				return result
			} catch (err) {
				await client.query('ROLLBACK')

				throw err
			} finally {
				client.release()
			}
		},
	}
}
