import { type Db, type SqlFragment, sql } from 'mimir'

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

export async function createLog(db: Db, input: LogInput): Promise<LogEntry> {
	return db.get<LogEntry>(
		sql`
			INSERT INTO saga.logs (type, level, service, message, metadata)
			VALUES (${input.type}, ${input.level}, ${input.service}, ${input.message}, ${sql.json(input.metadata)})
			RETURNING id, type, level, service, message, metadata, created_at::text as created_at
		`,
	)
}

export async function createBatch(db: Db, inputs: LogInput[]): Promise<LogEntry[]> {
	const rows = inputs.map((input) => [
		input.type,
		input.level,
		input.service,
		input.message,
		JSON.stringify(input.metadata),
	])

	return db.many<LogEntry>(
		sql`
			INSERT INTO saga.logs (type, level, service, message, metadata)
			VALUES ${sql.values(rows)}
			RETURNING id, type, level, service, message, metadata, created_at::text as created_at
		`,
	)
}

export async function queryLogs(db: Db, input: QueryInput): Promise<LogList> {
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

	const where = sql.and(conditions)

	const total = await db.val<string>(sql`
		SELECT COUNT(*)
		FROM saga.logs ${where}
	`)

	const data = await db.many<LogEntry>(
		sql`
			SELECT id, type, level, service, message, metadata, created_at::text as created_at
			FROM saga.logs ${where}
			ORDER BY created_at DESC
			LIMIT ${input.limit} OFFSET ${input.offset}
		`,
	)

	return { data, total: Number.parseInt(total, 10) }
}
