import { createDb as createMimirDb, type Db } from 'mimir'
import { getConfig } from './config.js'

let _db: Db | null = null

export function createDb(): Db {
	if (!_db) _db = createMimirDb(getConfig().getPool())

	return _db
}
