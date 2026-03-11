import { z } from 'zod'

import {
	createListSchema,
	createSortSchema,
	DateRangeSchema,
	ErrorSchema,
	MessageSchema,
	PaginationSchema,
} from '../index.js'

describe('PaginationSchema', () => {
	it('accepts valid pagination params', () => {
		const result = PaginationSchema.safeParse({ limit: 25, offset: 10 })

		expect(result.success).toBe(true)
		expect(result.data).toEqual({ limit: 25, offset: 10 })
	})

	it('applies defaults when omitted', () => {
		const result = PaginationSchema.parse({})

		expect(result).toEqual({ limit: 50, offset: 0 })
	})

	it('coerces string numbers', () => {
		const result = PaginationSchema.parse({ limit: '20', offset: '5' })

		expect(result).toEqual({ limit: 20, offset: 5 })
	})

	it('rejects limit below 1', () => {
		const result = PaginationSchema.safeParse({ limit: 0 })

		expect(result.success).toBe(false)
	})

	it('rejects limit above 1000', () => {
		const result = PaginationSchema.safeParse({ limit: 1001 })

		expect(result.success).toBe(false)
	})

	it('rejects negative offset', () => {
		const result = PaginationSchema.safeParse({ offset: -1 })

		expect(result.success).toBe(false)
	})
})

describe('ErrorSchema', () => {
	it('accepts valid error objects', () => {
		const result = ErrorSchema.safeParse({
			error: 'Not Found',
			message: 'Resource not found',
			statusCode: 404,
		})

		expect(result.success).toBe(true)
	})

	it('rejects missing fields', () => {
		const result = ErrorSchema.safeParse({ error: 'Bad' })

		expect(result.success).toBe(false)
	})
})

describe('MessageSchema', () => {
	it('accepts valid message objects', () => {
		const result = MessageSchema.safeParse({ message: 'OK' })

		expect(result.success).toBe(true)
	})
})

describe('createListSchema', () => {
	const ItemSchema = z.object({ id: z.string(), name: z.string() })
	const ItemListSchema = createListSchema(ItemSchema, 'ItemList')

	it('accepts valid list responses', () => {
		const result = ItemListSchema.safeParse({
			data: [{ id: '1', name: 'Test' }],
			total: 1,
		})

		expect(result.success).toBe(true)
	})

	it('accepts empty lists', () => {
		const result = ItemListSchema.safeParse({ data: [], total: 0 })

		expect(result.success).toBe(true)
	})

	it('rejects invalid items in array', () => {
		const result = ItemListSchema.safeParse({
			data: [{ id: 123 }],
			total: 1,
		})

		expect(result.success).toBe(false)
	})

	it('rejects missing total', () => {
		const result = ItemListSchema.safeParse({ data: [] })

		expect(result.success).toBe(false)
	})
})

describe('DateRangeSchema', () => {
	it('accepts valid date range', () => {
		const result = DateRangeSchema.safeParse({
			from: '2026-01-01T00:00:00.000Z',
			to: '2026-12-31T23:59:59.000Z',
		})

		expect(result.success).toBe(true)
	})

	it('accepts empty object (both optional)', () => {
		const result = DateRangeSchema.safeParse({})

		expect(result.success).toBe(true)
	})

	it('rejects invalid date strings', () => {
		const result = DateRangeSchema.safeParse({ from: 'yesterday' })

		expect(result.success).toBe(false)
	})
})

describe('createSortSchema', () => {
	const SortSchema = createSortSchema(['created_at', 'name', 'email'] as const)

	it('accepts valid sort params', () => {
		const result = SortSchema.safeParse({ sort_by: 'name', sort_order: 'asc' })

		expect(result.success).toBe(true)
	})

	it('defaults to first field and desc', () => {
		const result = SortSchema.parse({})

		expect(result).toEqual({ sort_by: 'created_at', sort_order: 'desc' })
	})

	it('rejects invalid sort fields', () => {
		const result = SortSchema.safeParse({ sort_by: 'invalid_field' })

		expect(result.success).toBe(false)
	})

	it('rejects invalid sort order', () => {
		const result = SortSchema.safeParse({ sort_order: 'random' })

		expect(result.success).toBe(false)
	})
})
