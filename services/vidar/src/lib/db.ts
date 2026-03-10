import { createDatabase } from 'mimir'
import { loadEnv } from './env.js'

export const { closePool, db, getPool } = createDatabase(() => loadEnv().DATABASE_URL)
