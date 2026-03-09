import { z } from 'zod'

export const ErrorSchema = z
	.object({
		error: z.string(),
		message: z.string(),
		statusCode: z.number(),
	})
	.openapi('Error')

export const MessageSchema = z
	.object({
		message: z.string(),
	})
	.openapi('Message')

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
		id: z.string().uuid(),
		topic: z.string(),
		payload: z.record(z.string(), z.unknown()),
		source: z.string(),
		created_at: z.string().datetime(),
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
			example: 'http://bifrost:8000/api/webhooks/user-registered',
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
		id: z.string().uuid(),
		topic: z.string(),
		callback_url: z.string().url(),
		service: z.string(),
		is_active: z.boolean(),
		created_at: z.string().datetime(),
		updated_at: z.string().datetime(),
	})
	.openapi('Subscription')

export const SubscriptionListSchema = z
	.object({
		data: z.array(SubscriptionSchema),
		total: z.number(),
	})
	.openapi('SubscriptionList')
