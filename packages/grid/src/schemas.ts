import { z } from '@hono/zod-openapi'
import {
	createListSchema,
	DetailsSchema,
	EventTypeSchema,
	IdSchema,
	IpAddressSchema,
	OptionalTimestampSchema,
	ServiceNameSchema,
	TimestampSchema,
} from 'skuld'

export { ErrorSchema, MessageSchema } from 'skuld'

export const IngestEventSchema = z
	.object({
		ip: IpAddressSchema,
		event_type: EventTypeSchema,
		details: DetailsSchema,
		service: ServiceNameSchema,
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
		expires_at: OptionalTimestampSchema,
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
