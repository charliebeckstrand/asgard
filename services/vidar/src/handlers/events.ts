import { sql } from 'saga'
import type { IngestEvent, SecurityEvent } from 'skuld'
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
