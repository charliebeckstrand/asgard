import {
	BanListSchema,
	BanSchema,
	CheckIpResponseSchema,
	CreateBanSchema,
	createListSchema,
	ErrorSchema,
	IdSchema,
	IngestEventSchema,
	IpAddressSchema,
	MessageSchema,
	SecurityEventSchema,
	TimestampSchema,
} from 'skuld'
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
}

export type CheckIpResponse = z.infer<typeof CheckIpResponseSchema>

export const jsonResponse = <S extends z.ZodTypeAny>(schema: S, description: string) =>
	({
		content: { 'application/json': { schema } },
		description,
	}) as const

/** Wrap rows in the { data, total } envelope used by every list endpoint. */
export const toList = <T>(items: T[]): { data: T[]; total: number } => ({
	data: items,
	total: items.length,
})

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
