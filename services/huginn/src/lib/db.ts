import { createDatabase } from 'mimir'
import { environment } from './env.js'

export const { closePool, db, getPool } = createDatabase(() => environment().DATABASE_URL)
