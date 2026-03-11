import {
	createListSchema,
	IdSchema,
	LogLevelSchema,
	MetadataSchema,
	ServiceNameSchema,
	TimestampSchema,
} from 'skuld'
import { z } from 'zod'

export const CreateLogSchema = z.object({
	type: z.string().max(50).default('server'),
	level: LogLevelSchema,
	service: ServiceNameSchema,
	message: z.string().min(1),
	metadata: MetadataSchema,
})

export const BatchCreateSchema = z.object({
	logs: z.array(CreateLogSchema).min(1).max(1000),
})

export const LogEntrySchema = z.object({
	id: IdSchema,
	type: z.string(),
	level: z.string(),
	service: z.string(),
	message: z.string(),
	metadata: z.record(z.string(), z.unknown()),
	created_at: TimestampSchema,
})

export const LogListSchema = createListSchema(LogEntrySchema, 'LogList')

export const LogQuerySchema = z.object({
	type: z.string().optional(),
	level: LogLevelSchema.optional(),
	service: z.string().optional(),
	from: z.iso.datetime().optional(),
	to: z.iso.datetime().optional(),
	limit: z.coerce.number().min(1).max(1000).default(50),
	offset: z.coerce.number().min(0).default(0),
})
