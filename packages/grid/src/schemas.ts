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

// --- Security Events ---

export const IngestEventSchema = z
	.object({
		ip: z.string().min(1).openapi({ description: 'Source IP address', example: '192.168.1.100' }),
		event_type: z
			.string()
			.min(1)
			.openapi({ description: 'Type of security event', example: 'login_failed' }),
		details: z
			.record(z.string(), z.unknown())
			.default({})
			.openapi({ description: 'Additional event details' }),
		service: z
			.string()
			.min(1)
			.openapi({ description: 'Service that generated the event', example: 'heimdall' }),
	})
	.openapi('IngestEvent')

export const SecurityEventSchema = z
	.object({
		id: z.uuid(),
		ip: z.string(),
		event_type: z.string(),
		details: z.record(z.string(), z.unknown()),
		service: z.string(),
		created_at: z.iso.datetime(),
	})
	.openapi('SecurityEvent')

// --- Bans ---

export const CheckIpResponseSchema = z
	.object({
		banned: z.boolean(),
		reason: z.string().optional(),
		expires_at: z.iso.datetime().optional(),
	})
	.openapi('CheckIpResponse')

export const CreateBanSchema = z
	.object({
		ip: z.string().min(1).openapi({ description: 'IP address to ban', example: '10.0.0.1' }),
		reason: z.string().min(1).openapi({ description: 'Reason for the ban', example: 'Manual ban' }),
		duration_minutes: z.coerce
			.number()
			.positive()
			.optional()
			.openapi({ description: 'Ban duration in minutes. Omit for permanent ban.' }),
	})
	.openapi('CreateBan')

export const BanSchema = z
	.object({
		id: z.uuid(),
		ip: z.string(),
		reason: z.string(),
		rule_id: z.string().nullable(),
		created_by: z.string(),
		expires_at: z.iso.datetime().nullable(),
		created_at: z.iso.datetime(),
	})
	.openapi('Ban')

export const BanListSchema = z
	.object({
		data: z.array(BanSchema),
		total: z.number(),
	})
	.openapi('BanList')
