import { Client } from 'pg'

const SQL_FRAGMENT = Symbol('SqlFragment')

export interface SqlFragment {
	readonly [SQL_FRAGMENT]: true
	readonly text: string
	readonly values: unknown[]
}

function escapeIdentifier(name: string): string {
	return Client.prototype.escapeIdentifier.call(null as never, name)
}

function isSqlFragment(value: unknown): value is SqlFragment {
	return typeof value === 'object' && value !== null && SQL_FRAGMENT in value
}

function reNumber(text: string, offset: number): string {
	if (offset === 0) return text

	return text.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`)
}

function normalizeWhitespace(text: string): string {
	const lines = text.split('\n')

	while (lines[0]?.trim() === '') {
		lines.shift()
	}

	while (lines.at(-1)?.trim() === '') {
		lines.pop()
	}

	if (lines.length === 0) {
		return ''
	}

	return lines.map((line) => line.trim()).join(' ')
}

function sql(strings: TemplateStringsArray, ...params: unknown[]): SqlFragment {
	const textParts: string[] = []

	const values: unknown[] = []

	for (let i = 0; i < strings.length; i++) {
		textParts.push(strings[i])

		if (i < params.length) {
			const param = params[i]

			if (isSqlFragment(param)) {
				textParts.push(reNumber(param.text, values.length))

				values.push(...param.values)
			} else {
				values.push(param)

				textParts.push(`$${values.length}`)
			}
		}
	}

	return { [SQL_FRAGMENT]: true, text: normalizeWhitespace(textParts.join('')), values }
}

/**
 * Inlines a string verbatim into a SQL fragment with no escaping or
 * parameterization. The caller is responsible for ensuring the value is
 * trusted SQL — never pass user input.
 */
sql.raw = function raw(value: string): SqlFragment {
	return { [SQL_FRAGMENT]: true, text: value, values: [] }
}

sql.join = function join(fragments: SqlFragment[], separator = ', '): SqlFragment {
	if (fragments.length === 0) {
		return { [SQL_FRAGMENT]: true, text: '', values: [] }
	}

	const textParts: string[] = []

	const values: unknown[] = []

	for (let i = 0; i < fragments.length; i++) {
		if (i > 0) {
			textParts.push(separator)
		}

		textParts.push(reNumber(fragments[i].text, values.length))

		values.push(...fragments[i].values)
	}

	return { [SQL_FRAGMENT]: true, text: textParts.join(''), values }
}

sql.json = function json(value: unknown): SqlFragment {
	return { [SQL_FRAGMENT]: true, text: '$1', values: [JSON.stringify(value)] }
}

sql.and = function and(conditions: SqlFragment[]): SqlFragment {
	if (conditions.length === 0) {
		return { [SQL_FRAGMENT]: true, text: '', values: [] }
	}

	const joined = sql.join(conditions, ' AND ')

	return { [SQL_FRAGMENT]: true, text: `WHERE ${joined.text}`, values: joined.values }
}

sql.values = function values(rows: unknown[][]): SqlFragment {
	if (rows.length === 0) {
		throw new Error('sql.values() requires at least one row')
	}

	const textParts: string[] = []

	const allValues: unknown[] = []

	for (const row of rows) {
		const placeholders: string[] = []

		for (const val of row) {
			allValues.push(val)

			placeholders.push(`$${allValues.length}`)
		}

		textParts.push(`(${placeholders.join(', ')})`)
	}

	return { [SQL_FRAGMENT]: true, text: textParts.join(', '), values: allValues }
}

sql.or = function or(conditions: SqlFragment[]): SqlFragment {
	if (conditions.length === 0) {
		return { [SQL_FRAGMENT]: true, text: '', values: [] }
	}

	const joined = sql.join(conditions, ' OR ')

	return { [SQL_FRAGMENT]: true, text: `(${joined.text})`, values: joined.values }
}

sql.set = function set(obj: Record<string, unknown>): SqlFragment {
	const entries = Object.entries(obj)

	if (entries.length === 0) {
		throw new Error('sql.set() requires at least one column')
	}

	const fragments = entries.map(([key, value]) => sql`${sql.raw(escapeIdentifier(key))} = ${value}`)

	return sql`SET ${sql.join(fragments)}`
}

sql.insert = function insert(table: string, data: Record<string, unknown>): SqlFragment {
	const keys = Object.keys(data)

	if (keys.length === 0) {
		throw new Error('sql.insert() requires at least one column')
	}

	const columns = keys.map(escapeIdentifier).join(', ')

	const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')

	return {
		[SQL_FRAGMENT]: true,
		text: `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
		values: Object.values(data),
	}
}

export { sql }
