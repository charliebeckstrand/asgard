import { z } from '@hono/zod-openapi'
import { createListSchema } from './composites.js'
import { IdSchema, IpAddressSchema, TimestampSchema } from './primitives.js'

const eventType = z
	.string()
	.min(1)
	.openapi({ description: 'Type of event', example: 'login_failed' })

const serviceName = z
	.string()
	.min(1)
	.max(100)
	.openapi({ description: 'Service name', example: 'bifrost' })

const details = z
	.record(z.string(), z.unknown())
	.default({})
	.openapi({ description: 'Additional details' })

const optionalTimestamp = z.iso.datetime().optional().openapi({
	description: 'Optional ISO 8601 datetime',
})

export const IngestEventSchema = z
	.object({
		ip: IpAddressSchema,
		event_type: eventType,
		details,
		service: serviceName,
	})
	.openapi('IngestEvent')

export const SecurityEventSchema = z
	.object({
		id: IdSchema,
		ip: z.string(),
		event_type: z.string(),
		details: z.record(z.string(), z.unknown()),
		service: z.string(),
		created_at: TimestampSchema,
	})
	.openapi('SecurityEvent')

export const CheckIpResponseSchema = z
	.object({
		banned: z.boolean(),
		reason: z.string().optional(),
		expires_at: optionalTimestamp,
	})
	.openapi('CheckIpResponse')

export const CreateBanSchema = z
	.object({
		ip: IpAddressSchema,
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
		id: IdSchema,
		ip: z.string(),
		reason: z.string(),
		rule_id: z.string().nullable(),
		created_by: z.string(),
		expires_at: z.iso.datetime().nullable(),
		created_at: TimestampSchema,
	})
	.openapi('Ban')

export const BanListSchema = createListSchema(BanSchema, 'BanList')
