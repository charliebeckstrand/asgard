import { z } from 'zod'

export { ErrorSchema, MessageSchema } from 'grid'

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
		id: z.uuid(),
		topic: z.string(),
		payload: z.record(z.string(), z.unknown()),
		source: z.string(),
		created_at: z.iso.datetime(),
	})
	.openapi('Event')

export const CreateSubscriptionSchema = z
	.object({
		topic: z
			.string()
			.min(1)
			.max(255)
			.openapi({ description: 'Event topic to subscribe to', example: 'user.registered' }),
		callback_url: z.url().openapi({
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
		id: z.uuid(),
		topic: z.string(),
		callback_url: z.url(),
		service: z.string(),
		is_active: z.boolean(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	})
	.openapi('Subscription')

export const SubscriptionListSchema = z
	.object({
		data: z.array(SubscriptionSchema),
		total: z.number(),
	})
	.openapi('SubscriptionList')
