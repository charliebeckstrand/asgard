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
