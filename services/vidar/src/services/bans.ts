import { getPool } from '../lib/db.js'

export interface BanRow {
	id: string
	ip: string
	reason: string
	rule_id: string | null
	created_by: string
	expires_at: string | null
	created_at: string
}

export async function isIpBanned(
	ip: string,
): Promise<{ banned: boolean; reason?: string; expires_at?: string }> {
	const pool = getPool()

	const { rows } = await pool.query<BanRow>(
		`SELECT reason, expires_at FROM bans
		 WHERE ip = $1 AND (expires_at IS NULL OR expires_at > now())
		 LIMIT 1`,
		[ip],
	)

	if (rows.length === 0) {
		return { banned: false }
	}

	return {
		banned: true,
		reason: rows[0].reason,
		expires_at: rows[0].expires_at ?? undefined,
	}
}

export async function createBan(
	ip: string,
	reason: string,
	options?: { rule_id?: string; created_by?: string; duration_minutes?: number },
): Promise<BanRow> {
	const pool = getPool()

	const { rows } = await pool.query<BanRow>(
		`INSERT INTO bans (ip, reason, rule_id, created_by, expires_at)
		 VALUES ($1, $2, $3, $4, CASE WHEN $5::int IS NOT NULL THEN now() + make_interval(mins => $5::int) ELSE NULL END)
		 ON CONFLICT (ip) DO UPDATE SET
		   reason = EXCLUDED.reason,
		   rule_id = EXCLUDED.rule_id,
		   created_by = EXCLUDED.created_by,
		   expires_at = EXCLUDED.expires_at,
		   created_at = now()
		 RETURNING *`,
		[
			ip,
			reason,
			options?.rule_id ?? null,
			options?.created_by ?? 'system',
			options?.duration_minutes ?? null,
		],
	)

	return rows[0]
}

export async function removeBan(ip: string): Promise<boolean> {
	const pool = getPool()

	const { rowCount } = await pool.query('DELETE FROM bans WHERE ip = $1', [ip])

	return (rowCount ?? 0) > 0
}

export async function listActiveBans(): Promise<{ data: BanRow[]; total: number }> {
	const pool = getPool()

	const { rows } = await pool.query<BanRow>(
		`SELECT * FROM bans
		 WHERE expires_at IS NULL OR expires_at > now()
		 ORDER BY created_at DESC`,
	)

	return { data: rows, total: rows.length }
}

export async function cleanExpiredBans(): Promise<number> {
	const pool = getPool()

	const { rowCount } = await pool.query(
		'DELETE FROM bans WHERE expires_at IS NOT NULL AND expires_at <= now()',
	)

	return rowCount ?? 0
}
