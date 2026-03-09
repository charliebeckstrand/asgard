import pg from 'pg'

const { Pool } = pg

export interface PoolOptions {
	max?: number
	idleTimeoutMillis?: number
	connectionTimeoutMillis?: number
}

/**
 * Creates a PostgreSQL connection pool by decomposing a DATABASE_URL into
 * individual connection parameters.
 *
 * DigitalOcean managed Postgres breaks SSL validation when using a single
 * connection string, causing SELF_SIGNED_CERT_IN_CHAIN errors. Decomposing
 * the URL into host/port/database/user/password avoids this issue.
 */
export function createPool(databaseUrl: string, options?: PoolOptions): pg.Pool {
	const url = new URL(databaseUrl)

	const requiresSsl = url.searchParams.has('sslmode')

	return new Pool({
		host: url.hostname,
		port: parseInt(url.port, 10) || 5432,
		database: url.pathname.slice(1),
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
		max: options?.max ?? 5,
		idleTimeoutMillis: options?.idleTimeoutMillis ?? 30000,
		connectionTimeoutMillis: options?.connectionTimeoutMillis ?? 5000,
		ssl: requiresSsl ? { rejectUnauthorized: false } : false,
	})
}

export async function closePool(pool: pg.Pool): Promise<void> {
	await pool.end()
}
