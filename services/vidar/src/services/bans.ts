import { sql } from 'mimir'
import { getDb } from '../lib/db.js'

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
	const db = getDb()

	const row = await db.one<BanRow>(
		sql`SELECT reason, expires_at FROM vdr_bans
		 WHERE ip = ${ip} AND (expires_at IS NULL OR expires_at > now())
		 LIMIT 1`,
	)

	if (!row) {
		return { banned: false }
	}

	return {
		banned: true,
		reason: row.reason,
		expires_at: row.expires_at ?? undefined,
	}
}

export async function createBan(
	ip: string,
	reason: string,
	options?: { rule_id?: string; created_by?: string; duration_minutes?: number },
): Promise<BanRow> {
	const db = getDb()

	return db.first<BanRow>(
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
}

export async function removeBan(ip: string): Promise<boolean> {
	const db = getDb()

	const count = await db.exec(sql`DELETE FROM vdr_bans WHERE ip = ${ip}`)

	return count > 0
}

export async function listActiveBans(): Promise<{ data: BanRow[]; total: number }> {
	const db = getDb()

	const rows = await db.many<BanRow>(
		sql`SELECT * FROM vdr_bans
		 WHERE expires_at IS NULL OR expires_at > now()
		 ORDER BY created_at DESC`,
	)

	return { data: rows, total: rows.length }
}

export async function cleanExpiredBans(): Promise<number> {
	const db = getDb()

	return db.exec(sql`DELETE FROM vdr_bans WHERE expires_at IS NOT NULL AND expires_at <= now()`)
}
