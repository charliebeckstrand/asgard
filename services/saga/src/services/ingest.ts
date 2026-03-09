import { getPool } from '../lib/db.js'

type LogInput = {
	type: string
	level: string
	service: string
	message: string
	metadata: Record<string, unknown>
}

type LogEntry = {
	id: string
	type: string
	level: string
	service: string
	message: string
	metadata: Record<string, unknown>
	created_at: string
}

export async function ingestLog(input: LogInput): Promise<LogEntry> {
	const pool = getPool()

	const { rows } = await pool.query<LogEntry>(
		`INSERT INTO saga.logs (type, level, service, message, metadata)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, type, level, service, message, metadata, created_at::text as created_at`,
		[input.type, input.level, input.service, input.message, JSON.stringify(input.metadata)],
	)

	return rows[0]
}

export async function ingestBatch(inputs: LogInput[]): Promise<LogEntry[]> {
	const pool = getPool()

	const values: string[] = []
	const params: unknown[] = []
	let paramIndex = 1

	for (const input of inputs) {
		values.push(
			`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`,
		)
		params.push(
			input.type,
			input.level,
			input.service,
			input.message,
			JSON.stringify(input.metadata),
		)
		paramIndex += 5
	}

	const { rows } = await pool.query<LogEntry>(
		`INSERT INTO saga.logs (type, level, service, message, metadata)
		 VALUES ${values.join(', ')}
		 RETURNING id, type, level, service, message, metadata, created_at::text as created_at`,
		params,
	)

	return rows
}
