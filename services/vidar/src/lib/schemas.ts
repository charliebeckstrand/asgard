import { createListSchema, IpAddressSchema, RuleSeveritySchema, SecurityEventSchema } from 'skuld'
import { z } from 'zod'

export const SecurityEventListSchema = createListSchema(SecurityEventSchema, 'SecurityEventList')

const RuleSchema = z
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
