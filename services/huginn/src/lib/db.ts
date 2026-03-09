import { closePool as closeMimirPool, createPool } from 'mimir'
import { loadEnv } from './env.js'

let pool: ReturnType<typeof createPool> | null = null

export function getPool() {
	if (!pool) {
		const env = loadEnv()

		if (!env.DATABASE_URL) {
			throw new Error('DATABASE_URL is not configured')
		}

		pool = createPool(env.DATABASE_URL, { max: 10 })
	}

	return pool
}

export async function closePool(): Promise<void> {
	if (pool) {
		await closeMimirPool(pool)
		pool = null
	}
}
