import type { Pool, PoolClient, QueryResultRow } from 'pg'
import { createPool, type PoolOptions } from './pool.js'
import type { SqlFragment } from './sql.js'

export class NoRowsError extends Error {
	constructor(query?: string) {
		const base = 'Expected at least one row, but got none'

		super(query ? `${base}: ${query}` : base)

		this.name = 'NoRowsError'
	}
}

export interface Queryable {
	query<T extends QueryResultRow>(fragment: SqlFragment): Promise<T | null>
	get<T extends QueryResultRow>(fragment: SqlFragment): Promise<T>
	many<T extends QueryResultRow>(fragment: SqlFragment): Promise<T[]>
	exec(fragment: SqlFragment): Promise<number>
	val<T>(fragment: SqlFragment): Promise<T>
}

export interface Db extends Queryable {
	tx<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
	ping(): Promise<boolean>
}

function toConfig(fragment: SqlFragment): { text: string; values: unknown[] } {
	return { text: fragment.text, values: [...fragment.values] }
}

function createQueryable(executor: { query: Pool['query'] | PoolClient['query'] }): Queryable {
	return {
		async query<T extends QueryResultRow>(fragment: SqlFragment): Promise<T | null> {
			const { rows } = await executor.query<T>(toConfig(fragment))

			return rows[0] ?? null
		},

		async get<T extends QueryResultRow>(fragment: SqlFragment): Promise<T> {
			const { rows } = await executor.query<T>(toConfig(fragment))

			if (rows.length === 0) {
				throw new NoRowsError(fragment.text)
			}

			return rows[0]
		},

		async many<T extends QueryResultRow>(fragment: SqlFragment): Promise<T[]> {
			const { rows } = await executor.query<T>(toConfig(fragment))

			return rows
		},

		async exec(fragment: SqlFragment): Promise<number> {
			const { rowCount } = await executor.query(toConfig(fragment))

			return rowCount ?? 0
		},

		async val<T>(fragment: SqlFragment): Promise<T> {
			const { rows } = await executor.query<Record<string, T>>(toConfig(fragment))

			if (rows.length === 0) {
				throw new NoRowsError(fragment.text)
			}

			const firstRow = rows[0]
			const keys = Object.keys(firstRow)

			return firstRow[keys[0]]
		},
	}
}

export function createDatabaseClient(pool: Pool): Db {
	const queryable = createQueryable(pool)

	return {
		...queryable,

		async ping(): Promise<boolean> {
			try {
				await pool.query('SELECT 1')

				return true
			} catch {
				return false
			}
		},

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

interface State {
	pool: Pool
	client: Db
}

export function createDatabase(getDatabaseUrl: () => string, options?: PoolOptions) {
	let state: State | null = null

	const init = (): State => {
		if (!state) {
			const pool = createPool(getDatabaseUrl(), options)
			state = { pool, client: createDatabaseClient(pool) }
		}

		return state
	}

	const db = new Proxy({} as Db, {
		get(_, prop) {
			return init().client[prop as keyof Db]
		},
	})

	return {
		db,

		getPool() {
			return init().pool
		},

		async closePool() {
			if (state) {
				await state.pool.end()

				state = null
			}
		},
	}
}
