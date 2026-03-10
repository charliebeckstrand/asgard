import { type SqlFragment, sql } from 'mimir'
import type { Pool } from 'pg'

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

type QueryInput = {
	type?: string
	level?: string
	service?: string
	from?: string
	to?: string
	limit: number
	offset: number
}

type LogList = {
	data: LogEntry[]
	total: number
}

export type { LogEntry, LogInput, LogList, QueryInput }

export async function createLog(pool: Pool, input: LogInput): Promise<LogEntry> {
	const { rows } = await pool.query<LogEntry>(
		sql`INSERT INTO saga.logs (type, level, service, message, metadata)
		 VALUES (${input.type}, ${input.level}, ${input.service}, ${input.message}, ${JSON.stringify(input.metadata)})
		 RETURNING id, type, level, service, message, metadata, created_at::text as created_at`,
	)

	return rows[0]
}

export async function createBatch(pool: Pool, inputs: LogInput[]): Promise<LogEntry[]> {
	const rows = inputs.map((input) => [
		input.type,
		input.level,
		input.service,
		input.message,
		JSON.stringify(input.metadata),
	])

	const { rows: result } = await pool.query<LogEntry>(
		sql`INSERT INTO saga.logs (type, level, service, message, metadata)
		 VALUES ${sql.values(rows)}
		 RETURNING id, type, level, service, message, metadata, created_at::text as created_at`,
	)

	return result
}

export async function queryLogs(pool: Pool, input: QueryInput): Promise<LogList> {
	const conditions: SqlFragment[] = []

	if (input.type) {
		conditions.push(sql`type = ${input.type}`)
	}

	if (input.level) {
		conditions.push(sql`level = ${input.level}`)
	}

	if (input.service) {
		conditions.push(sql`service = ${input.service}`)
	}

	if (input.from) {
		conditions.push(sql`created_at >= ${input.from}`)
	}

	if (input.to) {
		conditions.push(sql`created_at <= ${input.to}`)
	}

	const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, ' AND ')}` : sql.raw('')

	const countResult = await pool.query<{ count: string }>(
		sql`SELECT COUNT(*) as count FROM saga.logs ${where}`,
	)

	const total = Number.parseInt(countResult.rows[0].count, 10)

	const { rows } = await pool.query<LogEntry>(
		sql`SELECT id, type, level, service, message, metadata, created_at::text as created_at
		 FROM saga.logs ${where}
		 ORDER BY created_at DESC
		 LIMIT ${input.limit} OFFSET ${input.offset}`,
	)

	return { data: rows, total }
}
