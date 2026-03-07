import { z } from "zod"

export const ErrorSchema = z
	.object({
		error: z.string(),
		message: z.string(),
		statusCode: z.number(),
	})
	.openapi("Error")

export const MessageSchema = z
	.object({
		message: z.string(),
	})
	.openapi("Message")

export const PaginationSchema = z
	.object({
		page: z.coerce.number().int().positive().default(1),
		limit: z.coerce.number().int().positive().max(100).default(20),
	})
	.openapi("Pagination")
