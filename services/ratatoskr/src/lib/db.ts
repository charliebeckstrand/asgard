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

		const requiresSsl = env.DATABASE_URL.includes("sslmode=")

		pool = new Pool({
			connectionString: env.DATABASE_URL,
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
