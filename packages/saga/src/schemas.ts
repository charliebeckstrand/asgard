import { z } from 'zod'

export const CreateLogSchema = z.object({
	type: z.string().max(50).default('server'),
	level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']),
	service: z.string().min(1).max(100),
	message: z.string().min(1),
	metadata: z.record(z.string(), z.unknown()).default({}),
})

export const BatchCreateSchema = z.object({
	logs: z.array(CreateLogSchema).min(1).max(1000),
})

export const LogEntrySchema = z.object({
	id: z.uuid(),
	type: z.string(),
	level: z.string(),
	service: z.string(),
	message: z.string(),
	metadata: z.record(z.string(), z.unknown()),
	created_at: z.iso.datetime(),
})

export const LogListSchema = z.object({
	data: z.array(LogEntrySchema),
	total: z.number(),
})

export const LogQuerySchema = z.object({
	type: z.string().optional(),
	level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).optional(),
	service: z.string().optional(),
	from: z.iso.datetime().optional(),
	to: z.iso.datetime().optional(),
	limit: z.coerce.number().min(1).max(1000).default(50),
	offset: z.coerce.number().min(0).default(0),
})
