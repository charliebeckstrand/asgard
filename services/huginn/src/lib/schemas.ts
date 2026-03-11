import {
	CallbackUrlSchema,
	createListSchema,
	IdSchema,
	PayloadSchema,
	ServiceNameSchema,
	TimestampSchema,
	TopicSchema,
} from 'skuld'
import { z } from 'zod'

export { ErrorSchema, MessageSchema } from 'grid/schemas'

export const PublishEventSchema = z
	.object({
		topic: TopicSchema,
		payload: PayloadSchema,
		source: ServiceNameSchema,
	})
	.openapi('PublishEvent')

export const EventSchema = z
	.object({
		id: IdSchema,
		topic: z.string(),
		payload: z.record(z.string(), z.unknown()),
		source: z.string(),
		created_at: TimestampSchema,
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
		id: IdSchema,
		topic: z.string(),
		callback_url: z.url(),
		service: z.string(),
		is_active: z.boolean(),
		created_at: TimestampSchema,
		updated_at: TimestampSchema,
	})
	.openapi('Subscription')

export const SubscriptionListSchema = createListSchema(SubscriptionSchema, 'SubscriptionList')
