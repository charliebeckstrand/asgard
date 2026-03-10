import { type SqlFragment, sql } from 'mimir'
import { getPool } from '../lib/db.js'

export interface ThreatRow {
	id: string
	threat_type: string
	severity: string
	ip: string
	details: Record<string, unknown>
	action_taken: string | null
	resolved: boolean
	created_at: string
}

export async function createThreat(threat: {
	threat_type: string
	severity: string
	ip: string
	details: Record<string, unknown>
	action_taken?: string
}): Promise<ThreatRow> {
	const pool = getPool()

	const { rows } = await pool.query<ThreatRow>(
		sql`INSERT INTO vdr_threats (threat_type, severity, ip, details, action_taken)
		 VALUES (${threat.threat_type}, ${threat.severity}, ${threat.ip}, ${JSON.stringify(threat.details)}, ${threat.action_taken ?? null})
		 RETURNING *`,
	)

	return rows[0]
}

export async function listThreats(options?: {
	resolved?: boolean
	ip?: string
}): Promise<{ data: ThreatRow[]; total: number }> {
	const pool = getPool()

	const conditions: SqlFragment[] = []

	if (options?.resolved !== undefined) {
		conditions.push(sql`resolved = ${options.resolved}`)
	}

	if (options?.ip) {
		conditions.push(sql`ip = ${options.ip}`)
	}

	const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, ' AND ')}` : sql.raw('')

	const { rows } = await pool.query<ThreatRow>(
		sql`SELECT * FROM vdr_threats ${where} ORDER BY created_at DESC LIMIT 100`,
	)

	return { data: rows, total: rows.length }
}
