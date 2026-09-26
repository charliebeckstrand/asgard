import { Pool, type QueryConfig, type QueryResult, type QueryResultRow } from 'pg'
import { type ConnectionOptions, connectionConfig } from './connection.js'
import type { Logger } from './log/index.js'
import type { SqlFragment } from './sql.js'

export class NoRowsError extends Error {
	constructor(query?: string) {
		const base = 'Expected at least one row, but got none'

		super(query ? `${base}: ${query}` : base)

		this.name = 'NoRowsError'
	}
}

export interface Queryable {
	/** The first row, or null when there is none. */
	first<T extends QueryResultRow>(fragment: SqlFragment): Promise<T | null>
	/** The first row. Throws `NoRowsError` when there is none. */
	one<T extends QueryResultRow>(fragment: SqlFragment): Promise<T>
	many<T extends QueryResultRow>(fragment: SqlFragment): Promise<T[]>
	/** Runs a statement and returns the number of rows it touched. */
	exec(fragment: SqlFragment): Promise<number>
	/** The first column of the first row. Throws `NoRowsError` when there is none. */
	val<T>(fragment: SqlFragment): Promise<T>
}

export interface Db extends Queryable {
	/** Runs `fn` in a transaction, committed when it resolves and rolled back when it throws. */
	tx<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
	ping(): Promise<boolean>
	/** Ends the pool. A later query opens a new one. */
	close(): Promise<void>
}

export interface DbConfig extends ConnectionOptions {
	max?: number
	idleTimeoutMillis?: number
	connectionTimeoutMillis?: number
	/** Receives errors from idle connections. Defaults to the console. */
	logger?: Logger
}

type Run = <T extends QueryResultRow>(query: QueryConfig) => Promise<QueryResult<T>>

function createQueryable(run: Run): Queryable {
	async function query<T extends QueryResultRow>(fragment: SqlFragment): Promise<QueryResult<T>> {
		return run<T>({ text: fragment.text, values: [...fragment.values] })
	}

	async function one<T extends QueryResultRow>(fragment: SqlFragment): Promise<T> {
		const { rows } = await query<T>(fragment)

		if (rows.length === 0) {
			throw new NoRowsError(fragment.text)
		}

		return rows[0]
	}

	return {
		async first<T extends QueryResultRow>(fragment: SqlFragment) {
			const { rows } = await query<T>(fragment)

			return rows[0] ?? null
		},

		one,

		async many<T extends QueryResultRow>(fragment: SqlFragment) {
			const { rows } = await query<T>(fragment)

			return rows
		},

		async exec(fragment) {
			const { rowCount } = await query(fragment)

			return rowCount ?? 0
		},

		async val<T>(fragment: SqlFragment) {
			return Object.values(await one<Record<string, T>>(fragment))[0]
		},
	}
}

function createPool({
	max,
	idleTimeoutMillis,
	connectionTimeoutMillis,
	logger,
	...connection
}: DbConfig): Pool {
	const pool = new Pool({
		...connectionConfig(connection),
		max: max ?? 5,
		idleTimeoutMillis: idleTimeoutMillis ?? 30_000,
		connectionTimeoutMillis: connectionTimeoutMillis ?? 5_000,
	})

	// An idle connection can drop (network blip, database restart). Without a
	// listener, node-postgres raises that as an uncaught exception.
	pool.on('error', (err) => {
		if (logger) {
			logger.error({ err }, 'idle client error')
		} else {
			console.error('[saga] idle client error:', err.message)
		}
	})

	return pool
}

/**
 * A database handle backed by a connection pool. The pool opens on the first
 * query, so `config` is read then, not when the module defining `db` loads.
 */
export function createDb(config: () => DbConfig): Db {
	let pool: Pool | null = null

	const getPool = (): Pool => {
		pool ??= createPool(config())

		return pool
	}

	return {
		...createQueryable((query) => getPool().query(query)),

		async tx(fn) {
			const client = await getPool().connect()

			// A connection that can't roll back is broken, so it's destroyed, not reused.
			let broken: Error | undefined

			try {
				await client.query('BEGIN')

				const result = await fn(createQueryable((query) => client.query(query)))

				await client.query('COMMIT')

				return result
			} catch (err) {
				await client.query('ROLLBACK').catch((rollbackErr: Error) => {
					broken = rollbackErr
				})

				throw err
			} finally {
				client.release(broken)
			}
		},

		async ping() {
			try {
				await getPool().query('SELECT 1')

				return true
			} catch {
				return false
			}
		},

		async close() {
			const open = pool

			pool = null

			await open?.end()
		},
	}
}
