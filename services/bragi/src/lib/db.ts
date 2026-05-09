import { bootstrapServiceDb } from 'saga'
import { environment } from './env.js'
import { logger } from './log.js'

export const { closePool, db, migrate } = bootstrapServiceDb(
	'bragi',
	() => environment().DATABASE_URL,
	{ logger: logger() },
)
