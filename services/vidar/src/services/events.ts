import { getPool } from '../lib/db.js'
import { evaluateRules } from './rules.js'

export interface SecurityEventRow {
	id: string
	ip: string
	event_type: string
	details: Record<string, unknown>
	service: string
	created_at: string
}

export async function ingestEvent(event: {
	ip: string
	event_type: string
	details: Record<string, unknown>
	service: string
}): Promise<SecurityEventRow> {
	const pool = getPool()

	const { rows } = await pool.query<SecurityEventRow>(
		`INSERT INTO vdr_security_events (ip, event_type, details, service)
		 VALUES ($1, $2, $3, $4)
		 RETURNING *`,
		[event.ip, event.event_type, JSON.stringify(event.details), event.service],
	)

	// Evaluate rules asynchronously — don't block the response
	evaluateRules(event.ip, event.event_type).catch((err) => {
		console.error(`[vidar] Rule evaluation failed for IP ${event.ip}:`, err)
	})

	return rows[0]
}
