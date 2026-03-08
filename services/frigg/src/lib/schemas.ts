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

export const HealthResponseSchema = z
	.object({
		status: z.string(),
		service: z.string(),
	})
	.openapi('HealthResponse')

export const ConfigDataSchema = z.record(z.string(), z.string()).openapi('ConfigData')

export const ConfigResponseSchema = z
	.object({
		namespace: z.string(),
		data: ConfigDataSchema,
	})
	.openapi('ConfigResponse')

export const PutConfigSchema = z.record(z.string(), z.string()).openapi('PutConfig')

export const HistoryEntrySchema = z
	.object({
		value: z.string(),
		created_at: z.string(),
	})
	.openapi('HistoryEntry')

export const HistoryResponseSchema = z
	.object({
		namespace: z.string(),
		history: z.record(z.string(), HistoryEntrySchema),
	})
	.openapi('HistoryResponse')

export const RollbackResponseSchema = z
	.object({
		namespace: z.string(),
		key: z.string(),
		value: z.string(),
	})
	.openapi('RollbackResponse')

export const DeleteResponseSchema = z
	.object({
		deleted: z.number(),
	})
	.openapi('DeleteResponse')
