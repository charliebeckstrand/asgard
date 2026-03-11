import { z } from '@hono/zod-openapi'

// --- Pagination ---

export const PaginationSchema = z.object({
	limit: z.coerce
		.number()
		.min(1)
		.max(1000)
		.default(50)
		.openapi({ description: 'Maximum items to return', example: 50 }),
	offset: z.coerce
		.number()
		.min(0)
		.default(0)
		.openapi({ description: 'Number of items to skip', example: 0 }),
})

// --- API Responses ---

export const ErrorSchema = z
	.object({
		error: z.string(),
		message: z.string(),
		statusCode: z.number(),
	})
	.openapi('Error')

export const MessageSchema = z
	.object({
		message: z.string(),
	})
	.openapi('Message')

/**
 * Creates a typed list response schema with `data` array and `total` count.
 *
 * @example
 * ```ts
 * const UserListSchema = createListSchema(UserSchema, 'UserList')
 * ```
 */
export function createListSchema<T extends z.ZodType>(itemSchema: T, name: string) {
	return z
		.object({
			data: z.array(itemSchema),
			total: z.number().openapi({ description: 'Total number of items' }),
		})
		.openapi(name)
}

// --- Date range filtering ---

export const DateRangeSchema = z.object({
	from: z.iso.datetime().optional().openapi({ description: 'Start of date range (ISO 8601)' }),
	to: z.iso.datetime().optional().openapi({ description: 'End of date range (ISO 8601)' }),
})

// --- Sort ---

export function createSortSchema<T extends readonly [string, ...string[]]>(
	fields: T,
	defaultField: T[number] = fields[0],
) {
	return z.object({
		sort_by: z.enum(fields).default(defaultField).openapi({ description: 'Field to sort by' }),
		sort_order: z.enum(['asc', 'desc']).default('desc').openapi({ description: 'Sort direction' }),
	})
}
