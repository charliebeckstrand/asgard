import { type SqlFragment, sql } from 'mimir'
import { db } from '../lib/db.js'

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
	return db().get<ThreatRow>(
		sql`
			INSERT INTO vdr_threats (threat_type, severity, ip, details, action_taken)
			VALUES (${threat.threat_type}, ${threat.severity}, ${threat.ip}, ${sql.json(threat.details)}, ${threat.action_taken ?? null})
			RETURNING *
		`,
	)
}

export async function listThreats(options?: {
	resolved?: boolean
	ip?: string
}): Promise<{ data: ThreatRow[]; total: number }> {
	const conditions: SqlFragment[] = []

	if (options?.resolved !== undefined) {
		conditions.push(sql`resolved = ${options.resolved}`)
	}

	if (options?.ip) {
		conditions.push(sql`ip = ${options.ip}`)
	}

	const rows = await db().many<ThreatRow>(
		sql`
			SELECT *
			FROM vdr_threats ${sql.and(conditions)}
			ORDER BY created_at DESC
			LIMIT 100
		`,
	)

	return { data: rows, total: rows.length }
}
