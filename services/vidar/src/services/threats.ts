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
		`INSERT INTO vdr_threats (threat_type, severity, ip, details, action_taken)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING *`,
		[
			threat.threat_type,
			threat.severity,
			threat.ip,
			JSON.stringify(threat.details),
			threat.action_taken ?? null,
		],
	)

	return rows[0]
}

export async function listThreats(options?: {
	resolved?: boolean
	ip?: string
}): Promise<{ data: ThreatRow[]; total: number }> {
	const pool = getPool()

	const conditions: string[] = []

	const params: unknown[] = []

	if (options?.resolved !== undefined) {
		params.push(options.resolved)

		conditions.push(`resolved = $${params.length}`)
	}

	if (options?.ip) {
		params.push(options.ip)

		conditions.push(`ip = $${params.length}`)
	}

	const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

	const { rows } = await pool.query<ThreatRow>(
		`SELECT * FROM vdr_threats ${where} ORDER BY created_at DESC LIMIT 100`,
		params,
	)

	return { data: rows, total: rows.length }
}
