import pg from "pg"
import { loadEnv } from "./env.js"

const { Pool } = pg

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
	if (!pool) {
		const env = loadEnv()

		const isProduction = process.env.NODE_ENV === "production"

		pool = new Pool({
			connectionString: env.DATABASE_URL,
			max: 5,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 5000,
			ssl: isProduction ? { rejectUnauthorized: false } : false,
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
