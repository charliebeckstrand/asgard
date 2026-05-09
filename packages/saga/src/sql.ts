import { escapeIdentifier } from 'pg'

const SQL_FRAGMENT = Symbol('SqlFragment')

export interface SqlFragment {
	readonly [SQL_FRAGMENT]: true
	readonly text: string
	readonly values: unknown[]
}

function fragment(text: string, values: unknown[]): SqlFragment {
	return { [SQL_FRAGMENT]: true, text, values }
}

function isSqlFragment(value: unknown): value is SqlFragment {
	return typeof value === 'object' && value !== null && SQL_FRAGMENT in value
}

function reNumber(text: string, offset: number): string {
	if (offset === 0) return text

	return text.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`)
}

function normalizeWhitespace(text: string): string {
	return text.replace(/\s+/g, ' ').trim()
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

	return fragment(normalizeWhitespace(textParts.join('')), values)
}

/**
 * Inlines a string verbatim into a SQL fragment with no escaping or
 * parameterization. The caller is responsible for ensuring the value is
 * trusted SQL — never pass user input.
 */
sql.raw = function raw(value: string): SqlFragment {
	return fragment(value, [])
}

sql.join = function join(fragments: SqlFragment[], separator = ', '): SqlFragment {
	if (fragments.length === 0) {
		return fragment('', [])
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

	return fragment(textParts.join(''), values)
}

sql.json = function json(value: unknown): SqlFragment {
	return fragment('$1', [JSON.stringify(value)])
}

function combine(
	conditions: SqlFragment[],
	separator: string,
	wrap: (text: string) => string,
): SqlFragment {
	if (conditions.length === 0) {
		return fragment('', [])
	}

	const joined = sql.join(conditions, separator)

	return fragment(wrap(joined.text), joined.values)
}

sql.and = function and(conditions: SqlFragment[]): SqlFragment {
	return combine(conditions, ' AND ', (t) => `WHERE ${t}`)
}

sql.or = function or(conditions: SqlFragment[]): SqlFragment {
	return combine(conditions, ' OR ', (t) => `(${t})`)
}

sql.values = function values(rows: unknown[][]): SqlFragment {
	if (rows.length === 0) {
		throw new Error('sql.values() requires at least one row')
	}

	const width = rows[0].length

	if (rows.some((row) => row.length !== width)) {
		throw new Error('sql.values() requires all rows to have the same length')
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

	return fragment(textParts.join(', '), allValues)
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

	return fragment(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`, Object.values(data))
}

export { sql }
