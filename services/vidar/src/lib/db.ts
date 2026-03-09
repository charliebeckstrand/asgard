import { createLazyPool } from 'mimir'
import { loadEnv } from './env.js'

const { getPool, closePool } = createLazyPool(() => loadEnv().DATABASE_URL, { max: 5 })

export { closePool, getPool }
