import { describe, expect, it } from 'vitest'
import { sql } from '../sql.js'

describe('sql tagged template', () => {
	it('produces parameterized query with single value', () => {
		const result = sql`SELECT * FROM users WHERE id = ${1}`

		expect(result.text).toBe('SELECT * FROM users WHERE id = $1')
		expect(result.values).toEqual([1])
	})

	it('produces parameterized query with multiple values', () => {
		const result = sql`INSERT INTO users (name, email) VALUES (${`Alice`}, ${`alice@example.com`})`

		expect(result.text).toBe('INSERT INTO users (name, email) VALUES ($1, $2)')
		expect(result.values).toEqual(['Alice', 'alice@example.com'])
	})

	it('handles no interpolations', () => {
		const result = sql`SELECT * FROM users`

		expect(result.text).toBe('SELECT * FROM users')
		expect(result.values).toEqual([])
	})

	it('handles null and undefined values', () => {
		const result = sql`INSERT INTO t (a, b) VALUES (${null}, ${undefined})`

		expect(result.text).toBe('INSERT INTO t (a, b) VALUES ($1, $2)')
		expect(result.values).toEqual([null, undefined])
	})

	it('inlines nested sql fragments and re-numbers parameters', () => {
		const where = sql`WHERE id = ${1} AND name = ${'Alice'}`
		const result = sql`SELECT * FROM users ${where} LIMIT ${10}`

		expect(result.text).toBe('SELECT * FROM users WHERE id = $1 AND name = $2 LIMIT $3')
		expect(result.values).toEqual([1, 'Alice', 10])
	})

	it('handles deeply nested fragments', () => {
		const inner = sql`a = ${1}`
		const middle = sql`${inner} AND b = ${2}`
		const result = sql`SELECT * FROM t WHERE ${middle} AND c = ${3}`

		expect(result.text).toBe('SELECT * FROM t WHERE a = $1 AND b = $2 AND c = $3')
		expect(result.values).toEqual([1, 2, 3])
	})

	it('handles a fragment reused in multiple positions', () => {
		const condition = sql`status = ${'active'}`
		const result = sql`SELECT * FROM a WHERE ${condition} UNION SELECT * FROM b WHERE ${condition}`

		expect(result.text).toBe(
			'SELECT * FROM a WHERE status = $1 UNION SELECT * FROM b WHERE status = $2',
		)
		expect(result.values).toEqual(['active', 'active'])
	})
})

describe('sql.raw', () => {
	it('inlines raw text without placeholders', () => {
		const table = sql.raw('users')
		const result = sql`SELECT * FROM ${table}`

		expect(result.text).toBe('SELECT * FROM users')
		expect(result.values).toEqual([])
	})

	it('works alongside parameterized values', () => {
		const order = sql.raw('ORDER BY created_at DESC')
		const result = sql`SELECT * FROM users WHERE id = ${1} ${order}`

		expect(result.text).toBe('SELECT * FROM users WHERE id = $1 ORDER BY created_at DESC')
		expect(result.values).toEqual([1])
	})

	it('returns empty fragment for empty string', () => {
		const empty = sql.raw('')
		const result = sql`SELECT * FROM users ${empty}`

		expect(result.text).toBe('SELECT * FROM users ')
		expect(result.values).toEqual([])
	})
})

describe('sql.join', () => {
	it('joins fragments with default separator', () => {
		const fragments = [sql`a = ${1}`, sql`b = ${2}`, sql`c = ${3}`]
		const result = sql.join(fragments)

		expect(result.text).toBe('a = $1, b = $2, c = $3')
		expect(result.values).toEqual([1, 2, 3])
	})

	it('joins fragments with custom separator', () => {
		const fragments = [sql`a = ${1}`, sql`b = ${2}`]
		const result = sql.join(fragments, ' AND ')

		expect(result.text).toBe('a = $1 AND b = $2')
		expect(result.values).toEqual([1, 2])
	})

	it('returns empty fragment for empty array', () => {
		const result = sql.join([])

		expect(result.text).toBe('')
		expect(result.values).toEqual([])
	})

	it('handles single fragment without separator', () => {
		const result = sql.join([sql`a = ${1}`])

		expect(result.text).toBe('a = $1')
		expect(result.values).toEqual([1])
	})

	it('works when nested inside a sql template', () => {
		const conditions = [sql`ip = ${'1.2.3.4'}`, sql`resolved = ${false}`]
		const result = sql`SELECT * FROM threats WHERE ${sql.join(conditions, ' AND ')} LIMIT ${10}`

		expect(result.text).toBe('SELECT * FROM threats WHERE ip = $1 AND resolved = $2 LIMIT $3')
		expect(result.values).toEqual(['1.2.3.4', false, 10])
	})
})

describe('sql.values', () => {
	it('produces single row of placeholders', () => {
		const result = sql.values([['a', 'b', 'c']])

		expect(result.text).toBe('($1, $2, $3)')
		expect(result.values).toEqual(['a', 'b', 'c'])
	})

	it('produces multiple rows of placeholders', () => {
		const result = sql.values([
			['a', 1],
			['b', 2],
			['c', 3],
		])

		expect(result.text).toBe('($1, $2), ($3, $4), ($5, $6)')
		expect(result.values).toEqual(['a', 1, 'b', 2, 'c', 3])
	})

	it('throws on empty rows', () => {
		expect(() => sql.values([])).toThrow('sql.values() requires at least one row')
	})

	it('works when nested inside a sql template', () => {
		const rows = [
			['info', 'app', 'started'],
			['error', 'app', 'crashed'],
		]
		const result = sql`INSERT INTO logs (level, service, message) VALUES ${sql.values(rows)}`

		expect(result.text).toBe(
			'INSERT INTO logs (level, service, message) VALUES ($1, $2, $3), ($4, $5, $6)',
		)
		expect(result.values).toEqual(['info', 'app', 'started', 'error', 'app', 'crashed'])
	})
})

describe('sql.json', () => {
	it('stringifies an object and produces a parameterized value', () => {
		const data = { key: 'value', num: 42 }
		const result = sql`INSERT INTO t (data) VALUES (${sql.json(data)})`

		expect(result.text).toBe('INSERT INTO t (data) VALUES ($1)')
		expect(result.values).toEqual([JSON.stringify(data)])
	})

	it('stringifies an array', () => {
		const result = sql`INSERT INTO t (tags) VALUES (${sql.json([1, 2, 3])})`

		expect(result.text).toBe('INSERT INTO t (tags) VALUES ($1)')
		expect(result.values).toEqual(['[1,2,3]'])
	})

	it('stringifies null', () => {
		const result = sql`INSERT INTO t (data) VALUES (${sql.json(null)})`

		expect(result.values).toEqual(['null'])
	})

	it('re-numbers when combined with other parameters', () => {
		const data = { foo: 'bar' }
		const result = sql`INSERT INTO t (name, data) VALUES (${'alice'}, ${sql.json(data)})`

		expect(result.text).toBe('INSERT INTO t (name, data) VALUES ($1, $2)')
		expect(result.values).toEqual(['alice', JSON.stringify(data)])
	})
})

describe('sql.and', () => {
	it('produces WHERE clause from conditions', () => {
		const conditions = [sql`ip = ${'1.2.3.4'}`, sql`resolved = ${true}`]
		const result = sql`SELECT * FROM threats ${sql.and(conditions)} LIMIT ${10}`

		expect(result.text).toBe('SELECT * FROM threats WHERE ip = $1 AND resolved = $2 LIMIT $3')
		expect(result.values).toEqual(['1.2.3.4', true, 10])
	})

	it('returns empty string for no conditions', () => {
		const result = sql`SELECT * FROM threats ${sql.and([])} ORDER BY id`

		expect(result.text).toBe('SELECT * FROM threats  ORDER BY id')
		expect(result.values).toEqual([])
	})

	it('handles single condition', () => {
		const result = sql.and([sql`active = ${true}`])

		expect(result.text).toBe('WHERE active = $1')
		expect(result.values).toEqual([true])
	})

	it('works with range operators', () => {
		const conditions = [sql`created_at >= ${'2024-01-01'}`, sql`created_at <= ${'2024-12-31'}`]
		const result = sql.and(conditions)

		expect(result.text).toBe('WHERE created_at >= $1 AND created_at <= $2')
		expect(result.values).toEqual(['2024-01-01', '2024-12-31'])
	})

	it('works with JSON operators', () => {
		const conditions = [sql`details->>'email' = ${'test@test.com'}`]
		const result = sql.and(conditions)

		expect(result.text).toBe("WHERE details->>'email' = $1")
		expect(result.values).toEqual(['test@test.com'])
	})
})

describe('dynamic WHERE pattern', () => {
	it('builds conditional WHERE clause', () => {
		const conditions: ReturnType<typeof sql>[] = []

		const ip = '1.2.3.4'
		const resolved = true

		if (ip) {
			conditions.push(sql`ip = ${ip}`)
		}

		if (resolved !== undefined) {
			conditions.push(sql`resolved = ${resolved}`)
		}

		const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, ' AND ')}` : sql.raw('')

		const result = sql`SELECT * FROM threats ${where} ORDER BY created_at DESC LIMIT ${100}`

		expect(result.text).toBe(
			'SELECT * FROM threats WHERE ip = $1 AND resolved = $2 ORDER BY created_at DESC LIMIT $3',
		)
		expect(result.values).toEqual(['1.2.3.4', true, 100])
	})

	it('produces no WHERE when no conditions', () => {
		const conditions: ReturnType<typeof sql>[] = []

		const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, ' AND ')}` : sql.raw('')

		const result = sql`SELECT * FROM threats ${where} ORDER BY created_at DESC`

		expect(result.text).toBe('SELECT * FROM threats  ORDER BY created_at DESC')
		expect(result.values).toEqual([])
	})

	it('reuses WHERE fragment across multiple queries', () => {
		const where = sql`WHERE status = ${'active'}`

		const count = sql`SELECT COUNT(*) FROM users ${where}`
		const select = sql`SELECT * FROM users ${where} LIMIT ${10}`

		expect(count.text).toBe('SELECT COUNT(*) FROM users WHERE status = $1')
		expect(count.values).toEqual(['active'])

		expect(select.text).toBe('SELECT * FROM users WHERE status = $1 LIMIT $2')
		expect(select.values).toEqual(['active', 10])
	})
})
