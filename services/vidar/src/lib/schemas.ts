import {
	CheckIpResponseSchema,
	createListSchema,
	IdSchema,
	IpAddressSchema,
	TimestampSchema,
} from 'skuld'
import { z } from 'zod'

export type CheckIpResponse = z.infer<typeof CheckIpResponseSchema>

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
		severity: z.enum(['low', 'medium', 'high']),
		enabled: z.boolean(),
	})
	.openapi('Rule')

export const RuleListSchema = createListSchema(RuleSchema, 'RuleList')

export const AnalyzeRequestSchema = z
	.object({
		ip: IpAddressSchema.optional(),
	})
	.openapi('AnalyzeRequest')
