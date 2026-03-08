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

interface HistoryRow {
	id: string
	entry_id: string
	value: string
	created_at: string
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

		// Check if key already exists — if so, save current value to history
		const { rows: existing } = await pool.query<ConfigRow>(
			'SELECT id, value FROM configs WHERE namespace = $1 AND key = $2',
			[namespace, key],
		)

		if (existing.length > 0) {
			const entry = existing[0]

			// Replace any existing history for this entry (1 deep)
			await pool.query('DELETE FROM secret_history WHERE entry_id = $1', [entry.id])

			await pool.query('INSERT INTO secret_history (entry_id, value) VALUES ($1, $2)', [
				entry.id,
				entry.value,
			])
		}

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

export async function getHistory(
	namespace: string,
): Promise<Record<string, { value: string; created_at: string }>> {
	const pool = getPool()
	const env = loadEnv()

	const { rows } = await pool.query<HistoryRow & { key: string }>(
		`SELECT c.key, h.value, h.created_at
		 FROM secret_history h
		 JOIN configs c ON c.id = h.entry_id
		 WHERE c.namespace = $1
		 ORDER BY h.created_at DESC`,
		[namespace],
	)

	const result: Record<string, { value: string; created_at: string }> = {}

	for (const row of rows) {
		// Only keep the most recent per key (should only be 1 anyway)
		if (!result[row.key]) {
			result[row.key] = {
				value: decrypt(row.value, env.FRIGG_SECRET_KEY),
				created_at: row.created_at,
			}
		}
	}

	return result
}

export async function rollbackSecret(namespace: string, key: string): Promise<string | null> {
	const pool = getPool()
	const env = loadEnv()

	// Find the config entry
	const { rows: configRows } = await pool.query<ConfigRow>(
		'SELECT id, value FROM configs WHERE namespace = $1 AND key = $2',
		[namespace, key],
	)

	if (configRows.length === 0) return null

	const entry = configRows[0]

	// Find the history entry
	const { rows: historyRows } = await pool.query<HistoryRow>(
		`SELECT id, value FROM secret_history
		 WHERE entry_id = $1
		 ORDER BY created_at DESC
		 LIMIT 1`,
		[entry.id],
	)

	if (historyRows.length === 0) return null

	const historyEntry = historyRows[0]

	// Restore the previous value (it's already encrypted)
	await pool.query('UPDATE configs SET value = $1, updated_at = now() WHERE id = $2', [
		historyEntry.value,
		entry.id,
	])

	// Remove the history entry
	await pool.query('DELETE FROM secret_history WHERE id = $1', [historyEntry.id])

	return decrypt(historyEntry.value, env.FRIGG_SECRET_KEY)
}

export async function deleteConfig(namespace: string, key?: string): Promise<number> {
	const pool = getPool()

	if (key) {
		const { rowCount } = await pool.query('DELETE FROM configs WHERE namespace = $1 AND key = $2', [
			namespace,
			key,
		])
		return rowCount ?? 0
	}

	const { rowCount } = await pool.query('DELETE FROM configs WHERE namespace = $1', [namespace])
	return rowCount ?? 0
}
