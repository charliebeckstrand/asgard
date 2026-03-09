import { z } from 'zod'

export { ErrorSchema, MessageSchema } from 'grid'

export const PaginationSchema = z
	.object({
		page: z.coerce.number().int().positive().default(1),
		limit: z.coerce.number().int().positive().max(100).default(20),
	})
	.openapi('Pagination')
