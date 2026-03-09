import { getPool } from '../lib/db.js'

type SearchInput = {
	type?: string
	level?: string
	service?: string
	from?: string
	to?: string
	limit: number
	offset: number
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

type SearchResult = {
	data: LogEntry[]
	total: number
}

export async function searchLogs(input: SearchInput): Promise<SearchResult> {
	const pool = getPool()

	const conditions: string[] = []
	const params: unknown[] = []
	let paramIndex = 1

	if (input.type) {
		conditions.push(`type = $${paramIndex++}`)
		params.push(input.type)
	}

	if (input.level) {
		conditions.push(`level = $${paramIndex++}`)
		params.push(input.level)
	}

	if (input.service) {
		conditions.push(`service = $${paramIndex++}`)
		params.push(input.service)
	}

	if (input.from) {
		conditions.push(`created_at >= $${paramIndex++}`)
		params.push(input.from)
	}

	if (input.to) {
		conditions.push(`created_at <= $${paramIndex++}`)
		params.push(input.to)
	}

	const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

	const countResult = await pool.query<{ count: string }>(
		`SELECT COUNT(*) as count FROM saga.logs ${whereClause}`,
		params,
	)

	const total = Number.parseInt(countResult.rows[0].count, 10)

	const { rows } = await pool.query<LogEntry>(
		`SELECT id, type, level, service, message, metadata, created_at::text as created_at
		 FROM saga.logs ${whereClause}
		 ORDER BY created_at DESC
		 LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
		[...params, input.limit, input.offset],
	)

	return { data: rows, total }
}
