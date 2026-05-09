import { Pool } from 'pg'
import type { Logger } from './log/index.js'

export interface PoolOptions {
	max?: number
	idleTimeoutMillis?: number
	connectionTimeoutMillis?: number
	/**
	 * Structured logger for pool-internal events. When set, idle-client
	 * errors are reported here; otherwise they fall back to console.error.
	 */
	logger?: Logger
}

/**
 * Creates a PostgreSQL connection pool from a DATABASE_URL.
 *
 * Uses decomposed connection params instead of a connection string to avoid
 * SELF_SIGNED_CERT_IN_CHAIN errors on DigitalOcean managed Postgres.
 */
export function createPool(databaseUrl: string, options?: PoolOptions): Pool {
	const url = new URL(databaseUrl)

	const sslmode = url.searchParams.get('sslmode')

	const requiresSsl = sslmode !== null && sslmode !== 'disable'

	const pool = new Pool({
		host: url.hostname,
		port: Number.parseInt(url.port, 10) || 5432,
		database: url.pathname.slice(1),
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
		max: options?.max ?? 5,
		idleTimeoutMillis: options?.idleTimeoutMillis ?? 30000,
		connectionTimeoutMillis: options?.connectionTimeoutMillis ?? 5000,
		ssl: requiresSsl ? { rejectUnauthorized: false } : false,
	})

	// Idle clients can disconnect (network blip, DB restart). Without a listener,
	// node-postgres surfaces the error as an uncaught exception and crashes.
	pool.on('error', (err) => {
		if (options?.logger) {
			options.logger.error({ err }, 'idle client error')
		} else {
			console.error('[saga] idle client error:', err.message)
		}
	})

	return pool
}
