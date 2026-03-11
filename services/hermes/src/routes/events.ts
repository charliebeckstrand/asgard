import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import {
	CreateSubscriptionSchema,
	ErrorSchema,
	EventSchema,
	MessageSchema,
	PublishEventSchema,
	SubscriptionListSchema,
	SubscriptionSchema,
} from '../lib/schemas.js'
import { getHuginnClient, huginnBreaker } from '../lib/upstream.js'

const publishRoute = createRoute({
	method: 'post',
	path: '/events/publish',
	tags: ['Events'],
	summary: 'Publish an event',
	description: 'Forwards event publication to Huginn event bus.',
	request: {
		body: {
			content: { 'application/json': { schema: PublishEventSchema } },
			required: true,
		},
	},
	responses: {
		202: {
			content: { 'application/json': { schema: EventSchema } },
			description: 'Event accepted for delivery',
		},
		502: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Upstream service unavailable',
		},
	},
})

const listSubscriptionsRoute = createRoute({
	method: 'get',
	path: '/events/subscriptions',
	tags: ['Subscriptions'],
	summary: 'List subscriptions',
	description: 'Forwards subscription listing to Huginn event bus.',
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
		502: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Upstream service unavailable',
		},
	},
})

const createSubscriptionRoute = createRoute({
	method: 'post',
	path: '/events/subscriptions',
	tags: ['Subscriptions'],
	summary: 'Create subscription',
	description: 'Forwards subscription creation to Huginn event bus.',
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
		502: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Upstream service unavailable',
		},
	},
})

const deleteSubscriptionRoute = createRoute({
	method: 'delete',
	path: '/events/subscriptions/{id}',
	tags: ['Subscriptions'],
	summary: 'Delete subscription',
	description: 'Forwards subscription deletion to Huginn event bus.',
	request: {
		params: z.object({
			id: z.string().openapi({ description: 'Subscription ID' }),
		}),
	},
	responses: {
		200: {
			content: { 'application/json': { schema: MessageSchema } },
			description: 'Subscription deleted',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Subscription not found',
		},
		502: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Upstream service unavailable',
		},
	},
})

async function forwardToHuginn<T>(fn: () => Promise<Response>): Promise<T> {
	const res = await huginnBreaker.execute(() =>
		fn().then((r) => {
			if (!r.ok && r.status >= 500) throw new Error(`Huginn returned ${r.status}`)

			return r
		}),
	)

	return (await res.json()) as T
}

export const events = new OpenAPIHono()
	.openapi(publishRoute, async (c) => {
		const body = c.req.valid('json')

		try {
			const client = getHuginnClient()

			const data = await forwardToHuginn(() =>
				client.events.publish.$post(
					{ json: body },
					{ init: { signal: AbortSignal.timeout(10_000) } },
				),
			)

			return c.json(data, 202)
		} catch (error) {
			return c.json(
				{
					error: 'Bad Gateway',
					message: error instanceof Error ? error.message : 'Huginn is unavailable',
					statusCode: 502,
				},
				502,
			)
		}
	})
	.openapi(listSubscriptionsRoute, async (c) => {
		const { topic } = c.req.valid('query')

		try {
			const client = getHuginnClient()

			const data = await forwardToHuginn(() =>
				client.events.subscriptions.$get(
					{ query: { topic } },
					{ init: { signal: AbortSignal.timeout(10_000) } },
				),
			)

			return c.json(data, 200)
		} catch (error) {
			return c.json(
				{
					error: 'Bad Gateway',
					message: error instanceof Error ? error.message : 'Huginn is unavailable',
					statusCode: 502,
				},
				502,
			)
		}
	})
	.openapi(createSubscriptionRoute, async (c) => {
		const body = c.req.valid('json')

		try {
			const client = getHuginnClient()

			const data = await forwardToHuginn(() =>
				client.events.subscriptions.$post(
					{ json: body },
					{ init: { signal: AbortSignal.timeout(10_000) } },
				),
			)

			return c.json(data, 201)
		} catch (error) {
			return c.json(
				{
					error: 'Bad Gateway',
					message: error instanceof Error ? error.message : 'Huginn is unavailable',
					statusCode: 502,
				},
				502,
			)
		}
	})
	.openapi(deleteSubscriptionRoute, async (c) => {
		const { id } = c.req.valid('param')

		try {
			const client = getHuginnClient()

			const res = await huginnBreaker.execute(async () => {
				const r = await client.events.subscriptions[':id'].$delete(
					{ param: { id } },
					{ init: { signal: AbortSignal.timeout(10_000) } },
				)

				if (!r.ok && r.status >= 500) throw new Error(`Huginn returned ${r.status}`)

				return r
			})

			const data = (await res.json()) as Record<string, unknown>

			if (res.status === 404) {
				return c.json(
					{
						error: 'Not Found',
						message: (data.message as string) ?? 'Subscription not found',
						statusCode: 404,
					},
					404,
				)
			}

			return c.json(data as { message: string }, 200)
		} catch (error) {
			return c.json(
				{
					error: 'Bad Gateway',
					message: error instanceof Error ? error.message : 'Huginn is unavailable',
					statusCode: 502,
				},
				502,
			)
		}
	})
