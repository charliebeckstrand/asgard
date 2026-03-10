const SQL_FRAGMENT = Symbol('SqlFragment')

export interface SqlFragment {
	readonly [SQL_FRAGMENT]: true
	readonly text: string
	readonly values: unknown[]
}

function isSqlFragment(value: unknown): value is SqlFragment {
	return typeof value === 'object' && value !== null && SQL_FRAGMENT in value
}

function reNumber(text: string, offset: number): string {
	if (offset === 0) return text

	return text.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`)
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

	return { [SQL_FRAGMENT]: true, text: textParts.join(''), values }
}

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

export { sql }
