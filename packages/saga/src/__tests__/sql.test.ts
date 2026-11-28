import { sql } from '../sql.js'

/** The query text on one line, so a test can spell it without the template's indentation. */
const squish = (text: string) => text.replace(/\s+/g, ' ').trim()

describe('sql tagged template', () => {
	it('produces parameterized query with single value', () => {
		const result = sql`
			SELECT *
			FROM users
			WHERE id = ${1}
		`

		expect(squish(result.text)).toBe('SELECT * FROM users WHERE id = $1')

		expect(result.values).toEqual([1])
	})

	it('produces parameterized query with multiple values', () => {
		const result = sql`
			INSERT INTO users (name, email)
			VALUES (${`Alice`}, ${`alice@example.com`})
		`

		expect(squish(result.text)).toBe('INSERT INTO users (name, email) VALUES ($1, $2)')

		expect(result.values).toEqual(['Alice', 'alice@example.com'])
	})

	it('handles no interpolations', () => {
		const result = sql`
			SELECT *
			FROM users
		`

		expect(squish(result.text)).toBe('SELECT * FROM users')

		expect(result.values).toEqual([])
	})

	it('handles null and undefined values', () => {
		const result = sql`
			INSERT INTO t (a, b)
			VALUES (${null}, ${undefined})
		`

		expect(squish(result.text)).toBe('INSERT INTO t (a, b) VALUES ($1, $2)')

		expect(result.values).toEqual([null, undefined])
	})

	it('inlines nested sql fragments and re-numbers parameters', () => {
		const where = sql`
			WHERE id = ${1}
			AND name = ${'Alice'}
		`
		const result = sql`
			SELECT *
			FROM users ${where}
			LIMIT ${10}
		`

		expect(squish(result.text)).toBe('SELECT * FROM users WHERE id = $1 AND name = $2 LIMIT $3')

		expect(result.values).toEqual([1, 'Alice', 10])
	})

	it('handles deeply nested fragments', () => {
		const inner = sql`a = ${1}`

		const middle = sql`${inner} AND b = ${2}`

		const result = sql`
			SELECT *
			FROM t
			WHERE ${middle} AND c = ${3}
		`

		expect(squish(result.text)).toBe('SELECT * FROM t WHERE a = $1 AND b = $2 AND c = $3')

		expect(result.values).toEqual([1, 2, 3])
	})

	it('handles a fragment reused in multiple positions', () => {
		const condition = sql`status = ${'active'}`

		const result = sql`
			SELECT *
			FROM a
			WHERE ${condition}
			UNION
			SELECT *
			FROM b
			WHERE ${condition}
		`

		expect(squish(result.text)).toBe(
			'SELECT * FROM a WHERE status = $1 UNION SELECT * FROM b WHERE status = $2',
		)

		expect(result.values).toEqual(['active', 'active'])
	})
})

describe('sql.json', () => {
	it('stringifies an object and produces a parameterized value', () => {
		const data = { key: 'value', num: 42 }

		const result = sql`
			INSERT INTO t (data)
			VALUES (${sql.json(data)})
		`

		expect(squish(result.text)).toBe('INSERT INTO t (data) VALUES ($1)')

		expect(result.values).toEqual([JSON.stringify(data)])
	})

	it('stringifies an array', () => {
		const result = sql`
			INSERT INTO t (tags)
			VALUES (${sql.json([1, 2, 3])})
		`

		expect(squish(result.text)).toBe('INSERT INTO t (tags) VALUES ($1)')

		expect(result.values).toEqual(['[1,2,3]'])
	})

	it('stringifies null', () => {
		const result = sql`
			INSERT INTO t (data)
			VALUES (${sql.json(null)})
		`

		expect(result.values).toEqual(['null'])
	})

	it('re-numbers when combined with other parameters', () => {
		const data = { foo: 'bar' }

		const result = sql`
			INSERT INTO t (name, data)
			VALUES (${'alice'}, ${sql.json(data)})
		`

		expect(squish(result.text)).toBe('INSERT INTO t (name, data) VALUES ($1, $2)')

		expect(result.values).toEqual(['alice', JSON.stringify(data)])
	})
})

describe('sql.where', () => {
	it('produces WHERE clause from conditions', () => {
		const conditions = [sql`ip = ${'1.2.3.4'}`, sql`resolved = ${true}`]

		const result = sql`
			SELECT *
			FROM threats ${sql.where(conditions)}
			LIMIT ${10}
		`

		expect(squish(result.text)).toBe(
			'SELECT * FROM threats WHERE ip = $1 AND resolved = $2 LIMIT $3',
		)

		expect(result.values).toEqual(['1.2.3.4', true, 10])
	})

	it('returns empty string for no conditions', () => {
		const result = sql`
			SELECT *
			FROM threats ${sql.where([])}
			ORDER BY id
		`

		expect(squish(result.text)).toBe('SELECT * FROM threats ORDER BY id')

		expect(result.values).toEqual([])
	})

	it('handles single condition', () => {
		const result = sql.where([sql`active = ${true}`])

		expect(squish(result.text)).toBe('WHERE active = $1')

		expect(result.values).toEqual([true])
	})

	it('reuses WHERE fragment across multiple queries', () => {
		const where = sql.where([sql`status = ${'active'}`])

		const count = sql`
			SELECT COUNT(*)
			FROM users ${where}
		`

		const select = sql`
			SELECT *
			FROM users ${where}
			LIMIT ${10}
		`

		expect(squish(count.text)).toBe('SELECT COUNT(*) FROM users WHERE status = $1')

		expect(count.values).toEqual(['active'])

		expect(squish(select.text)).toBe('SELECT * FROM users WHERE status = $1 LIMIT $2')

		expect(select.values).toEqual(['active', 10])
	})

	it('composes nested fragments as conditions', () => {
		const result = sql.where([sql`active = ${true}`, sql`(role = ${'admin'} OR role = ${'mod'})`])

		expect(squish(result.text)).toBe('WHERE active = $1 AND (role = $2 OR role = $3)')

		expect(result.values).toEqual([true, 'admin', 'mod'])
	})
})

describe('SqlFragment', () => {
	it('leaves dollar signs in nested SQL text alone', () => {
		const discount = sql`note = '$1 off' AND id = ${7}`

		const result = sql`SELECT * FROM t WHERE a = ${1} AND ${discount}`

		expect(squish(result.text)).toBe("SELECT * FROM t WHERE a = $1 AND note = '$1 off' AND id = $2")

		expect(result.values).toEqual([1, 7])
	})

	it('keeps the text as written, so a comment ends at its line', () => {
		const result = sql`SELECT a -- the first column\nFROM t WHERE b = ${1}`

		expect(result.text).toBe('SELECT a -- the first column\nFROM t WHERE b = $1')
	})

	it('keeps the whitespace inside a quoted literal', () => {
		const result = sql`SELECT 'a  b'`

		expect(result.text).toBe("SELECT 'a  b'")
	})
})
