import {
	CallbackUrlSchema,
	CircuitBreakerStateSchema,
	createListSchema,
	HealthStatusSchema,
	PayloadSchema,
	ServiceNameSchema,
	ServiceReachabilitySchema,
	TopicSchema,
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
} from 'grid/schemas'

export const PublishEventSchema = z
	.object({
		topic: TopicSchema,
		payload: PayloadSchema,
		source: ServiceNameSchema,
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
		topic: TopicSchema,
		callback_url: CallbackUrlSchema,
		service: ServiceNameSchema,
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

export const SubscriptionListSchema = createListSchema(SubscriptionSchema, 'SubscriptionList')

export const ServiceStatusSchema = z
	.object({
		status: ServiceReachabilitySchema,
		latency: z.number().optional(),
	})
	.openapi('ServiceStatus')

export const CircuitBreakerStatusSchema = z
	.object({
		state: CircuitBreakerStateSchema,
		failures: z.number(),
	})
	.openapi('CircuitBreakerStatus')

export const AggregateHealthSchema = z
	.object({
		status: HealthStatusSchema,
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
