import { createListSchema, IdSchema, IpAddressSchema, TimestampSchema } from 'skuld'
import { z } from 'zod'

export {
	BanListSchema,
	BanSchema,
	CheckIpResponseSchema,
	CreateBanSchema,
	ErrorSchema,
	IngestEventSchema,
	MessageSchema,
	SecurityEventSchema,
} from 'grid/schemas'

export const ThreatSchema = z
	.object({
		id: IdSchema,
		threat_type: z.string(),
		severity: z.string(),
		ip: z.string(),
		details: z.record(z.string(), z.unknown()),
		action_taken: z.string().nullable(),
		resolved: z.boolean(),
		created_at: TimestampSchema,
	})
	.openapi('Threat')

export const ThreatListSchema = createListSchema(ThreatSchema, 'ThreatList')

export const RuleSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		description: z.string(),
		event_type: z.string(),
		threshold: z.number(),
		window_minutes: z.number(),
		ban_duration_minutes: z.number(),
		enabled: z.boolean(),
	})
	.openapi('Rule')

export const RuleListSchema = z
	.object({
		data: z.array(RuleSchema),
	})
	.openapi('RuleList')

export const AnalyzeRequestSchema = z
	.object({
		ip: IpAddressSchema.optional(),
	})
	.openapi('AnalyzeRequest')

export const AnalyzeResponseSchema = z
	.object({
		status: z.string(),
		message: z.string(),
		analysis: z.record(z.string(), z.unknown()).optional(),
	})
	.openapi('AnalyzeResponse')
