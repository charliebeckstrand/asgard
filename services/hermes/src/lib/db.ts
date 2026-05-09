import { bootstrapServiceDb } from 'saga'
import { environment } from './env.js'

export const { closePool, db, getPool, migrate } = bootstrapServiceDb(
	'hermes',
	() => environment().DATABASE_URL,
)
