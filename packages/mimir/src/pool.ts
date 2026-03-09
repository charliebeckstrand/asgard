import { Pool } from 'pg'

export interface PoolOptions {
	max?: number
	idleTimeoutMillis?: number
	connectionTimeoutMillis?: number
}

/**
 * Creates a PostgreSQL connection pool from a DATABASE_URL.
 *
 * Uses decomposed connection params instead of a connection string to avoid
 * SELF_SIGNED_CERT_IN_CHAIN errors on DigitalOcean managed Postgres.
 */
export function createPool(databaseUrl: string, options?: PoolOptions): Pool {
	const url = new URL(databaseUrl)

	const requiresSsl = url.searchParams.has('sslmode')

	return new Pool({
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
}

export async function closePool(pool: Pool): Promise<void> {
	await pool.end()
}
