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
} from 'grid'

// --- Threats ---

export const ThreatSchema = z
	.object({
		id: z.uuid(),
		threat_type: z.string(),
		severity: z.string(),
		ip: z.string(),
		details: z.record(z.string(), z.unknown()),
		action_taken: z.string().nullable(),
		resolved: z.boolean(),
		created_at: z.iso.datetime(),
	})
	.openapi('Threat')

export const ThreatListSchema = z
	.object({
		data: z.array(ThreatSchema),
		total: z.number(),
	})
	.openapi('ThreatList')

// --- Rules ---

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

// --- Analyze ---

export const AnalyzeRequestSchema = z
	.object({
		ip: z
			.string()
			.min(1)
			.optional()
			.openapi({ description: 'IP address to analyze. Omit to analyze all recent activity.' }),
	})
	.openapi('AnalyzeRequest')

export const AnalyzeResponseSchema = z
	.object({
		status: z.string(),
		message: z.string(),
		analysis: z.record(z.string(), z.unknown()).optional(),
	})
	.openapi('AnalyzeResponse')
