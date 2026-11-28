import { type Queryable, sql } from 'saga'
import { type BanSource, type CheckIpResponse, toList } from 'skuld'
import { db } from '../lib/db.js'

export interface BanRow {
	id: string
	ip: string
	reason: string
	rule_id: string | null
	created_by: BanSource
	expires_at: string | null
	created_at: string
}

export async function isIpBanned(ip: string): Promise<CheckIpResponse> {
	const row = await db.first<Pick<BanRow, 'reason' | 'expires_at'>>(
		sql`
			SELECT reason, expires_at
			FROM vdr_bans
		 	WHERE ip = ${ip}
			AND (expires_at IS NULL OR expires_at > now())
		`,
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

/**
 * Bans `ip` for `minutes`, unless a ban in force already lasts longer: a rule
 * never shortens a longer or permanent ban. True when it banned.
 */
export async function banForAtLeast(
	q: Queryable,
	ip: string,
	minutes: number,
	ban: { reason: string; rule_id: string },
): Promise<boolean> {
	const row = await q.first<{ id: string }>(sql`
		INSERT INTO vdr_bans (ip, reason, rule_id, created_by, expires_at)
		VALUES (${ip}, ${ban.reason}, ${ban.rule_id}, 'vidar', now() + make_interval(mins => ${minutes}::int))
		ON CONFLICT (ip) DO UPDATE SET
			reason = EXCLUDED.reason,
			rule_id = EXCLUDED.rule_id,
			created_by = EXCLUDED.created_by,
			expires_at = EXCLUDED.expires_at,
			created_at = now()
		WHERE vdr_bans.expires_at IS NOT NULL AND vdr_bans.expires_at < EXCLUDED.expires_at
		RETURNING id
	`)

	return row !== null
}

/** Lifts the ban in force on `ip`. False when there is none. */
export async function removeBan(ip: string): Promise<boolean> {
	const count = await db.exec(sql`
		DELETE FROM vdr_bans
		WHERE ip = ${ip}
		AND (expires_at IS NULL OR expires_at > now())
	`)

	return count > 0
}

export async function listActiveBans(): Promise<{ data: BanRow[]; total: number }> {
	const rows = await db.many<BanRow>(
		sql`
			SELECT * FROM vdr_bans
		 	WHERE expires_at IS NULL OR expires_at > now()
		 	ORDER BY created_at DESC
		`,
	)

	return toList(rows)
}

export async function cleanExpiredBans(): Promise<number> {
	return db.exec(sql`
		DELETE FROM vdr_bans
		WHERE expires_at IS NOT NULL AND expires_at <= now()
	`)
}
