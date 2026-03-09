import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import {
	CreateSubscriptionSchema,
	ErrorSchema,
	MessageSchema,
	SubscriptionListSchema,
	SubscriptionSchema,
} from '../lib/schemas.js'
import { apiKeyAuth } from '../middleware/auth.js'
import {
	createSubscription,
	deleteSubscription,
	listSubscriptions,
} from '../services/subscriptions.js'

const listRoute = createRoute({
	method: 'get',
	path: '/subscriptions',
	tags: ['Subscriptions'],
	summary: 'List subscriptions',
	description: 'List all event subscriptions',
	security: [{ ApiKey: [] }],
	request: {
		query: z.object({
			topic: z.string().optional().openapi({ description: 'Filter by topic' }),
		}),
	},
	responses: {
		200: {
			content: { 'application/json': { schema: SubscriptionListSchema } },
			description: 'List of subscriptions',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const createRoute_ = createRoute({
	method: 'post',
	path: '/subscriptions',
	tags: ['Subscriptions'],
	summary: 'Create subscription',
	description: 'Register a new event subscription',
	security: [{ ApiKey: [] }],
	request: {
		body: {
			content: { 'application/json': { schema: CreateSubscriptionSchema } },
			required: true,
		},
	},
	responses: {
		201: {
			content: { 'application/json': { schema: SubscriptionSchema } },
			description: 'Subscription created',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const deleteRoute = createRoute({
	method: 'delete',
	path: '/subscriptions/{id}',
	tags: ['Subscriptions'],
	summary: 'Delete subscription',
	description: 'Remove an event subscription',
	security: [{ ApiKey: [] }],
	request: {
		params: z.object({
			id: z.string().uuid().openapi({ description: 'Subscription ID' }),
		}),
	},
	responses: {
		200: {
			content: { 'application/json': { schema: MessageSchema } },
			description: 'Subscription deleted',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Subscription not found',
		},
	},
})

export const subscriptions = new OpenAPIHono()

subscriptions.use('/subscriptions', apiKeyAuth())
subscriptions.use('/subscriptions/*', apiKeyAuth())

subscriptions
	.openapi(listRoute, async (c) => {
		const { topic } = c.req.valid('query')
		const result = await listSubscriptions(topic)

		return c.json(result, 200)
	})
	.openapi(createRoute_, async (c) => {
		const body = c.req.valid('json')
		const subscription = await createSubscription(body)

		return c.json(subscription, 201)
	})
	.openapi(deleteRoute, async (c) => {
		const { id } = c.req.valid('param')

		const deleted = await deleteSubscription(id)

		if (!deleted) {
			return c.json({ error: 'Not Found', message: 'Subscription not found', statusCode: 404 }, 404)
		}

		return c.json({ message: 'Subscription deleted' }, 200)
	})
