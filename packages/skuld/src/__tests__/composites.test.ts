import { z } from 'zod'

import { createListSchema, ErrorSchema, MessageSchema } from '../index.js'

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
