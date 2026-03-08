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
