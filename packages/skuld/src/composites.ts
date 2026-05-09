import { z } from '@hono/zod-openapi'

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

export function createListSchema<T extends z.ZodType>(itemSchema: T, name: string) {
	return z
		.object({
			data: z.array(itemSchema),
			total: z.number().openapi({ description: 'Total number of items' }),
		})
		.openapi(name)
}

/** Wrap rows in the { data, total } envelope produced by createListSchema. */
export const toList = <T>(items: T[]): { data: T[]; total: number } => ({
	data: items,
	total: items.length,
})
