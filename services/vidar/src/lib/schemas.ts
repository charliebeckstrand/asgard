import { z } from 'zod'

export { ErrorSchema, MessageSchema } from 'grid'

// --- Health ---

export const HealthResponseSchema = z
	.object({
		status: z.enum(['healthy', 'degraded', 'unhealthy']),
		version: z.string(),
		uptime: z.number(),
	})
	.openapi('HealthResponse')

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
		id: z.string().uuid(),
		ip: z.string(),
		event_type: z.string(),
		details: z.record(z.string(), z.unknown()),
		service: z.string(),
		created_at: z.string().datetime(),
	})
	.openapi('SecurityEvent')

// --- Bans ---

export const CheckIpResponseSchema = z
	.object({
		banned: z.boolean(),
		reason: z.string().optional(),
		expires_at: z.string().datetime().optional(),
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
		id: z.string().uuid(),
		ip: z.string(),
		reason: z.string(),
		rule_id: z.string().nullable(),
		created_by: z.string(),
		expires_at: z.string().datetime().nullable(),
		created_at: z.string().datetime(),
	})
	.openapi('Ban')

export const BanListSchema = z
	.object({
		data: z.array(BanSchema),
		total: z.number(),
	})
	.openapi('BanList')

// --- Threats ---

export const ThreatSchema = z
	.object({
		id: z.string().uuid(),
		threat_type: z.string(),
		severity: z.string(),
		ip: z.string(),
		details: z.record(z.string(), z.unknown()),
		action_taken: z.string().nullable(),
		resolved: z.boolean(),
		created_at: z.string().datetime(),
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
