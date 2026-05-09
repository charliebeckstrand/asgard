import { createListSchema, IdSchema, IpAddressSchema, TimestampSchema } from 'skuld'
import { z } from 'zod'

export const RuleSeveritySchema = z
	.enum(['low', 'medium', 'high'])
	.openapi({ description: 'Rule / threat severity' })

export type RuleSeverity = z.infer<typeof RuleSeveritySchema>

export const ThreatSchema = z
	.object({
		id: IdSchema,
		threat_type: z.string(),
		severity: RuleSeveritySchema,
		ip: IpAddressSchema,
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
		severity: RuleSeveritySchema,
		enabled: z.boolean(),
	})
	.openapi('Rule')

export const RuleListSchema = createListSchema(RuleSchema, 'RuleList')

export const AnalyzeRequestSchema = z
	.object({
		ip: IpAddressSchema.optional(),
	})
	.openapi('AnalyzeRequest')
