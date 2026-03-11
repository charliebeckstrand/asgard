import { z } from 'zod'

export { ErrorSchema, MessageSchema } from 'grid'

// --- Events (Huginn proxy) ---

export const PublishEventSchema = z
	.object({
		topic: z
			.string()
			.min(1)
			.max(255)
			.openapi({ description: 'Event topic', example: 'user.registered' }),
		payload: z
			.record(z.string(), z.unknown())
			.default({})
			.openapi({ description: 'Event payload data' }),
		source: z
			.string()
			.min(1)
			.max(100)
			.openapi({ description: 'Service that published the event', example: 'heimdall' }),
	})
	.openapi('PublishEvent')

export const EventSchema = z
	.object({
		id: z.string(),
		topic: z.string(),
		payload: z.record(z.string(), z.unknown()),
		source: z.string(),
		created_at: z.string(),
	})
	.openapi('Event')

export const CreateSubscriptionSchema = z
	.object({
		topic: z
			.string()
			.min(1)
			.max(255)
			.openapi({ description: 'Event topic to subscribe to', example: 'user.registered' }),
		callback_url: z.string().url().openapi({
			description: 'URL to receive event callbacks',
			example: 'http://localhost:3000/api/webhooks/user-registered',
		}),
		service: z
			.string()
			.min(1)
			.max(100)
			.openapi({ description: 'Name of the subscribing service', example: 'bifrost' }),
	})
	.openapi('CreateSubscription')

export const SubscriptionSchema = z
	.object({
		id: z.string(),
		topic: z.string(),
		callback_url: z.string(),
		service: z.string(),
		is_active: z.boolean(),
		created_at: z.string(),
		updated_at: z.string(),
	})
	.openapi('Subscription')

export const SubscriptionListSchema = z
	.object({
		data: z.array(SubscriptionSchema),
		total: z.number(),
	})
	.openapi('SubscriptionList')

// --- Security (Vidar proxy) ---

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
	.openapi('IngestSecurityEvent')

export const SecurityEventSchema = z
	.object({
		id: z.string(),
		ip: z.string(),
		event_type: z.string(),
		details: z.record(z.string(), z.unknown()),
		service: z.string(),
		created_at: z.string(),
	})
	.openapi('SecurityEvent')

export const CheckIpResponseSchema = z
	.object({
		banned: z.boolean(),
		reason: z.string().optional(),
		expires_at: z.string().optional(),
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
		id: z.string(),
		ip: z.string(),
		reason: z.string(),
		rule_id: z.string().nullable(),
		created_by: z.string(),
		expires_at: z.string().nullable(),
		created_at: z.string(),
	})
	.openapi('Ban')

export const BanListSchema = z
	.object({
		data: z.array(BanSchema),
		total: z.number(),
	})
	.openapi('BanList')

// --- Health ---

export const ServiceStatusSchema = z
	.object({
		status: z.enum(['healthy', 'degraded', 'unreachable']),
		latency: z.number().optional(),
	})
	.openapi('ServiceStatus')

export const CircuitBreakerStatusSchema = z
	.object({
		state: z.enum(['closed', 'open', 'half-open']),
		failures: z.number(),
	})
	.openapi('CircuitBreakerStatus')

export const AggregateHealthSchema = z
	.object({
		status: z.enum(['healthy', 'degraded', 'unhealthy']),
		version: z.string(),
		uptime: z.number(),
		services: z.object({
			huginn: ServiceStatusSchema,
			vidar: ServiceStatusSchema,
		}),
		circuitBreakers: z.object({
			huginn: CircuitBreakerStatusSchema,
			vidar: CircuitBreakerStatusSchema,
		}),
	})
	.openapi('AggregateHealth')
