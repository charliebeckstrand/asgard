import { bootstrapServiceDb } from 'saga'
import { environment } from './env.js'

export const { closePool, db, migrate } = bootstrapServiceDb(
	'bifrost',
	() => environment().DATABASE_URL,
)
