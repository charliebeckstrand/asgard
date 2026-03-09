import { closePool, createPool, type PoolOptions } from './pool.js'

export function createLazyPool(getDatabaseUrl: () => string, options?: PoolOptions) {
	let pool: ReturnType<typeof createPool> | null = null

	return {
		getPool() {
			if (!pool) {
				pool = createPool(getDatabaseUrl(), options)
			}

			return pool
		},

		async closePool() {
			if (pool) {
				await closePool(pool)

				pool = null
			}
		},
	}
}
