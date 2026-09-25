import { type SqlFragment, sql } from 'saga'
import { type IngestEvent, type SecurityEvent, toList } from 'skuld'
import { db } from '../lib/db.js'
import { emitEvent } from '../lib/emitter.js'
import { logger } from '../lib/log.js'
import { evaluateRules } from './rules.js'

export async function ingestEvent(event: IngestEvent): Promise<SecurityEvent> {
	const row = await db.one<SecurityEvent>(
		sql`
			INSERT INTO vdr_security_events (ip, event_type, details, service)
			VALUES (${event.ip}, ${event.event_type}, ${sql.json(event.details)}, ${event.service})
			RETURNING *
		`,
	)

	emitEvent(row)

	// Evaluate rules asynchronously — don't block the response
	evaluateRules(event.ip, event.event_type).catch((err) => {
		logger().error({ err, ip: event.ip }, 'rule evaluation failed')
	})

	return row
}

export async function listEvents(options: {
	ip?: string
	event_type?: string
	limit: number
}): Promise<{ data: SecurityEvent[]; total: number }> {
	const conditions: SqlFragment[] = []

	if (options.ip) {
		conditions.push(sql`ip = ${options.ip}`)
	}

	if (options.event_type) {
		conditions.push(sql`event_type = ${options.event_type}`)
	}

	const rows = await db.many<SecurityEvent>(
		sql`
			SELECT *
			FROM vdr_security_events ${sql.where(conditions)}
			ORDER BY created_at DESC
			LIMIT ${options.limit}
		`,
	)

	return toList(rows)
}

/** Events far outside every rule window only grow the table. */
export async function purgeOldEvents(retentionDays: number): Promise<number> {
	return db.exec(sql`
		DELETE FROM vdr_security_events
		WHERE created_at < now() - make_interval(days => ${retentionDays}::int)
	`)
}
