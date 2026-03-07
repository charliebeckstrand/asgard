import pg from "pg"
import { loadEnv } from "./env.js"

const { Pool } = pg

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
	if (!pool) {
		const env = loadEnv()

		if (!env.DATABASE_URL) {
			throw new Error("DATABASE_URL is not configured")
		}

		const url = new URL(env.DATABASE_URL)
		const requiresSsl = url.searchParams.has("sslmode")

		pool = new Pool({
			host: url.hostname,
			port: parseInt(url.port, 10) || 5432,
			database: url.pathname.slice(1),
			user: decodeURIComponent(url.username),
			password: decodeURIComponent(url.password),
			max: 10,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 5000,
			ssl: requiresSsl ? { rejectUnauthorized: false } : false,
		})
	}

	return pool
}

export async function closePool(): Promise<void> {
	if (pool) {
		await pool.end()
		pool = null
	}
}
