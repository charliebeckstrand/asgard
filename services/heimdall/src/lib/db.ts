import { closePool as closeMimirPool, createPool } from "mimir"
import { loadEnv } from "./env.js"

let pool: ReturnType<typeof createPool> | null = null

export function getPool() {
	if (!pool) {
		const env = loadEnv()
		pool = createPool(env.DATABASE_URL, { max: 5 })
	}

	return pool
}

export async function closePool(): Promise<void> {
	if (pool) {
		await closeMimirPool(pool)
		pool = null
	}
}
