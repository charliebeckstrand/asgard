import { z } from 'zod'

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

export const CreateLogSchema = z
	.object({
		type: z
			.string()
			.max(50)
			.default('server')
			.openapi({ description: 'Log type', example: 'server' }),
		level: z
			.enum(['debug', 'info', 'warn', 'error', 'fatal'])
			.openapi({ description: 'Log level', example: 'info' }),
		service: z
			.string()
			.min(1)
			.max(100)
			.openapi({ description: 'Originating service', example: 'vidar' }),
		message: z
			.string()
			.min(1)
			.openapi({ description: 'Log message', example: 'Suspicious IP detected' }),
		metadata: z
			.record(z.string(), z.unknown())
			.default({})
			.openapi({ description: 'Additional structured data', example: { ip: '1.2.3.4' } }),
	})
	.openapi('CreateLog')

export const BatchCreateSchema = z
	.object({
		logs: z
			.array(CreateLogSchema)
			.min(1)
			.max(1000)
			.openapi({ description: 'Array of log entries' }),
	})
	.openapi('BatchCreate')

export const LogEntrySchema = z
	.object({
		id: z.string().uuid(),
		type: z.string(),
		level: z.string(),
		service: z.string(),
		message: z.string(),
		metadata: z.record(z.string(), z.unknown()),
		created_at: z.string().datetime(),
	})
	.openapi('LogEntry')

export const LogListSchema = z
	.object({
		data: z.array(LogEntrySchema),
		total: z.number(),
	})
	.openapi('LogList')

export const LogQuerySchema = z.object({
	type: z.string().optional().openapi({ description: 'Filter by log type' }),
	level: z
		.enum(['debug', 'info', 'warn', 'error', 'fatal'])
		.optional()
		.openapi({ description: 'Filter by level' }),
	service: z.string().optional().openapi({ description: 'Filter by service name' }),
	from: z.string().datetime().optional().openapi({ description: 'Start of time range (ISO 8601)' }),
	to: z.string().datetime().optional().openapi({ description: 'End of time range (ISO 8601)' }),
	limit: z.coerce
		.number()
		.min(1)
		.max(1000)
		.default(50)
		.openapi({ description: 'Max results to return' }),
	offset: z.coerce.number().min(0).default(0).openapi({ description: 'Number of results to skip' }),
})
