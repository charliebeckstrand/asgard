/**
 * A piece of SQL and the values bound to it. Fragments nest: interpolating one
 * into `sql` splices its text and values in place, so placeholders are numbered
 * once, when the query text is read, never rewritten.
 */
export class SqlFragment {
	constructor(
		readonly strings: readonly string[],
		readonly values: readonly unknown[],
	) {}

	/** The query text, with `$1`, `$2`, … in place of each value. */
	get text(): string {
		const text = this.strings.reduce((query, part, i) => `${query}$${i}${part}`)

		return text.replace(/\s+/g, ' ').trim()
	}
}

const empty = new SqlFragment([''], [])

/**
 * Tagged template that turns every interpolation into a bound value, except a
 * `SqlFragment`, which is spliced in as SQL.
 */
function sql(strings: TemplateStringsArray, ...params: unknown[]): SqlFragment {
	const parts = [strings[0]]

	const values: unknown[] = []

	for (const [i, param] of params.entries()) {
		if (param instanceof SqlFragment) {
			parts[parts.length - 1] += param.strings[0]

			parts.push(...param.strings.slice(1))

			values.push(...param.values)

			parts[parts.length - 1] += strings[i + 1]
		} else {
			parts.push(strings[i + 1])

			values.push(param)
		}
	}

	return new SqlFragment(parts, values)
}

sql.join = function join(fragments: SqlFragment[], separator = ', '): SqlFragment {
	const glue = new SqlFragment([separator], [])

	return fragments.reduce(
		(joined, fragment, i) => (i === 0 ? fragment : sql`${joined}${glue}${fragment}`),
		empty,
	)
}

/** `WHERE` with the conditions joined by `AND`, or nothing when there are none. */
sql.where = function where(conditions: SqlFragment[]): SqlFragment {
	return conditions.length > 0 ? sql`WHERE ${sql.join(conditions, ' AND ')}` : empty
}

/** Binds a value as JSON text. node-postgres would send an array as a Postgres array. */
sql.json = function json(value: unknown): SqlFragment {
	return new SqlFragment(['', ''], [JSON.stringify(value)])
}

export { sql }
