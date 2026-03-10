import { createDb, createLazyPool } from 'mimir'
import { loadEnv } from './env.js'

const { getPool, closePool } = createLazyPool(() => loadEnv().DATABASE_URL, { max: 5 })

const getDb = () => createDb(getPool())

export { closePool, getDb, getPool }
