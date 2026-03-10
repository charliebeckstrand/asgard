import { sql } from 'mimir'
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
		sql`SELECT reason, expires_at FROM vdr_bans
		 WHERE ip = ${ip} AND (expires_at IS NULL OR expires_at > now())
		 LIMIT 1`,
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
		sql`INSERT INTO vdr_bans (ip, reason, rule_id, created_by, expires_at)
		 VALUES (${ip}, ${reason}, ${options?.rule_id ?? null}, ${options?.created_by ?? 'system'}, CASE WHEN ${options?.duration_minutes ?? null}::int IS NOT NULL THEN now() + make_interval(mins => ${options?.duration_minutes ?? null}::int) ELSE NULL END)
		 ON CONFLICT (ip) DO UPDATE SET
		   reason = EXCLUDED.reason,
		   rule_id = EXCLUDED.rule_id,
		   created_by = EXCLUDED.created_by,
		   expires_at = EXCLUDED.expires_at,
		   created_at = now()
		 RETURNING *`,
	)

	return rows[0]
}

export async function removeBan(ip: string): Promise<boolean> {
	const pool = getPool()

	const { rowCount } = await pool.query(sql`DELETE FROM vdr_bans WHERE ip = ${ip}`)

	return (rowCount ?? 0) > 0
}

export async function listActiveBans(): Promise<{ data: BanRow[]; total: number }> {
	const pool = getPool()

	const { rows } = await pool.query<BanRow>(
		sql`SELECT * FROM vdr_bans
		 WHERE expires_at IS NULL OR expires_at > now()
		 ORDER BY created_at DESC`,
	)

	return { data: rows, total: rows.length }
}

export async function cleanExpiredBans(): Promise<number> {
	const pool = getPool()

	const { rowCount } = await pool.query(
		sql`DELETE FROM vdr_bans WHERE expires_at IS NOT NULL AND expires_at <= now()`,
	)

	return rowCount ?? 0
}
