import { decrypt, encrypt } from '../lib/crypto.js'
import { getPool } from '../lib/db.js'
import { loadEnv } from '../lib/env.js'

interface ConfigRow {
	id: string
	namespace: string
	key: string
	value: string
	created_at: string
	updated_at: string
}

export async function getConfig(namespace: string): Promise<Record<string, string>> {
	const pool = getPool()
	const env = loadEnv()

	const { rows } = await pool.query<ConfigRow>(
		'SELECT key, value FROM configs WHERE namespace = $1',
		[namespace],
	)

	const result: Record<string, string> = {}

	for (const row of rows) {
		result[row.key] = decrypt(row.value, env.FRIGG_SECRET_KEY)
	}

	return result
}

export async function putConfig(namespace: string, data: Record<string, string>): Promise<void> {
	const pool = getPool()
	const env = loadEnv()

	const entries = Object.entries(data)

	if (entries.length === 0) return

	for (const [key, value] of entries) {
		const encrypted = encrypt(value, env.FRIGG_SECRET_KEY)

		await pool.query(
			`INSERT INTO configs (namespace, key, value)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (namespace, key) DO UPDATE SET
			   value = EXCLUDED.value,
			   updated_at = now()`,
			[namespace, key, encrypted],
		)
	}
}
