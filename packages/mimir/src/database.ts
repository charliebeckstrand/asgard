import { createDb, type Db } from './db.js'
import { createLazyPool } from './lazy-pool.js'
import type { PoolOptions } from './pool.js'

export function createDatabase(getDatabaseUrl: () => string, options?: PoolOptions) {
	const { getPool, closePool } = createLazyPool(getDatabaseUrl, options)

	let _db: Db | null = null

	const db = (): Db => {
		if (!_db) _db = createDb(getPool())

		return _db
	}

	return { closePool, db, getPool }
}
