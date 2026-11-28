import { z } from '@hono/zod-openapi'
import { createListSchema } from './composites.js'
import { IdSchema, IpAddressSchema, TimestampSchema } from './primitives.js'

const BanSourceSchema = z
	.enum(['system', 'manual', 'vidar'])
	.openapi({ description: 'Origin of the ban' })

export type BanSource = z.infer<typeof BanSourceSchema>

// A snake_case name, the form the threat rules name the events they count.
const eventType = z
	.string()
	.min(1)
	.max(100)
	.regex(/^[a-z0-9_]+$/)
	.openapi({ description: 'Type of event', example: 'login_failed' })

const serviceName = z
	.string()
	.min(1)
	.max(100)
	.openapi({ description: 'Service name', example: 'bifrost' })

const details = z.record(z.string(), z.unknown()).openapi({ description: 'Additional details' })

export const IngestEventSchema = z
	.object({
		ip: IpAddressSchema,
		event_type: eventType,
		details: details.default({}),
		service: serviceName,
	})
	.openapi('IngestEvent')

export type IngestEvent = z.infer<typeof IngestEventSchema>

export const SecurityEventSchema = z
	.object({
		id: IdSchema,
		ip: IpAddressSchema,
		event_type: eventType,
		details,
		service: serviceName,
		account: z.string().nullable().openapi({
			description: 'Account the event names, from details.email',
			example: 'alice@example.com',
		}),
		created_at: TimestampSchema,
	})
	.openapi('SecurityEvent')

export type SecurityEvent = z.infer<typeof SecurityEventSchema>

export const CheckIpResponseSchema = z
	.object({
		banned: z.boolean(),
		reason: z.string().optional(),
		expires_at: TimestampSchema.optional(),
	})
	.openapi('CheckIpResponse')

export type CheckIpResponse = z.infer<typeof CheckIpResponseSchema>

const BanSchema = z
	.object({
		id: IdSchema,
		ip: IpAddressSchema,
		reason: z.string(),
		rule_id: z.string().nullable(),
		created_by: BanSourceSchema,
		expires_at: TimestampSchema.nullable(),
		created_at: TimestampSchema,
	})
	.openapi('Ban')

export const BanListSchema = createListSchema(BanSchema, 'BanList')

export type BanList = z.infer<typeof BanListSchema>

const RuleSeveritySchema = z
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

export type Threat = z.infer<typeof ThreatSchema>

export const ThreatListSchema = createListSchema(ThreatSchema, 'ThreatList')

export type ThreatList = z.infer<typeof ThreatListSchema>

export const ResolveThreatSchema = z
	.object({
		resolved: z.boolean().openapi({ description: 'Whether the threat has been handled' }),
	})
	.openapi('ResolveThreat')
