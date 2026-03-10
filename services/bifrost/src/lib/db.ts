import { createDb, createLazyPool, type Db } from 'mimir'
import { loadEnv } from './env.js'

const { getPool, closePool } = createLazyPool(() => loadEnv().DATABASE_URL)

let _db: Db | null = null

const db = (): Db => {
	if (!_db) _db = createDb(getPool())

	return _db
}

export { closePool, db, getPool }
