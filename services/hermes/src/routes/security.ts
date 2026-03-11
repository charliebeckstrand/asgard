import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import {
	BanListSchema,
	BanSchema,
	CheckIpResponseSchema,
	CreateBanSchema,
	ErrorSchema,
	IngestEventSchema,
	MessageSchema,
	SecurityEventSchema,
} from '../lib/schemas.js'
import { forwardToService, gatewayError, getVidarClient, vidarBreaker } from '../lib/upstream.js'

const checkIpRoute = createRoute({
	method: 'get',
	path: '/security/check-ip',
	tags: ['Security'],
	summary: 'Check if an IP is banned',
	description: 'Forwards IP ban check to Vidar security service.',
	request: {
		query: z.object({
			ip: z
				.string()
				.min(1)
				.openapi({ description: 'IP address to check', example: '192.168.1.100' }),
		}),
	},
	responses: {
		200: {
			content: { 'application/json': { schema: CheckIpResponseSchema } },
			description: 'Ban check result',
		},
		502: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Upstream service unavailable',
		},
	},
})

const listBansRoute = createRoute({
	method: 'get',
	path: '/security/bans',
	tags: ['Security'],
	summary: 'List active bans',
	description: 'Forwards ban listing to Vidar security service.',
	responses: {
		200: {
			content: { 'application/json': { schema: BanListSchema } },
			description: 'List of active bans',
		},
		502: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Upstream service unavailable',
		},
	},
})

const createBanRoute = createRoute({
	method: 'post',
	path: '/security/bans',
	tags: ['Security'],
	summary: 'Manually ban an IP',
	description: 'Forwards ban creation to Vidar security service.',
	request: {
		body: {
			content: { 'application/json': { schema: CreateBanSchema } },
			required: true,
		},
	},
	responses: {
		201: {
			content: { 'application/json': { schema: BanSchema } },
			description: 'Ban created',
		},
		502: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Upstream service unavailable',
		},
	},
})

const removeBanRoute = createRoute({
	method: 'delete',
	path: '/security/bans/{ip}',
	tags: ['Security'],
	summary: 'Unban an IP',
	description: 'Forwards ban removal to Vidar security service.',
	request: {
		params: z.object({
			ip: z.string().min(1).openapi({ description: 'IP address to unban' }),
		}),
	},
	responses: {
		200: {
			content: { 'application/json': { schema: MessageSchema } },
			description: 'Ban removed',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Ban not found',
		},
		502: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Upstream service unavailable',
		},
	},
})

const ingestEventRoute = createRoute({
	method: 'post',
	path: '/security/events',
	tags: ['Security'],
	summary: 'Ingest a security event',
	description: 'Forwards security event ingestion to Vidar.',
	request: {
		body: {
			content: { 'application/json': { schema: IngestEventSchema } },
			required: true,
		},
	},
	responses: {
		201: {
			content: { 'application/json': { schema: SecurityEventSchema } },
			description: 'Event ingested',
		},
		502: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Upstream service unavailable',
		},
	},
})

export const security = new OpenAPIHono()
	.openapi(checkIpRoute, async (c) => {
		const { ip } = c.req.valid('query')

		try {
			const client = getVidarClient()

			const data = await forwardToService(vidarBreaker, 'Vidar', CheckIpResponseSchema, () =>
				client.vidar['check-ip'].$get(
					{ query: { ip } },
					{ init: { signal: AbortSignal.timeout(5_000) } },
				),
			)

			return c.json(data, 200)
		} catch (error) {
			return c.json(gatewayError('Vidar', error), 502)
		}
	})
	.openapi(listBansRoute, async (c) => {
		try {
			const client = getVidarClient()

			const data = await forwardToService(vidarBreaker, 'Vidar', BanListSchema, () =>
				client.vidar.bans.$get({}, { init: { signal: AbortSignal.timeout(10_000) } }),
			)

			return c.json(data, 200)
		} catch (error) {
			return c.json(gatewayError('Vidar', error), 502)
		}
	})
	.openapi(createBanRoute, async (c) => {
		const body = c.req.valid('json')

		try {
			const client = getVidarClient()

			const data = await forwardToService(vidarBreaker, 'Vidar', BanSchema, () =>
				client.vidar.bans.$post({ json: body }, { init: { signal: AbortSignal.timeout(10_000) } }),
			)

			return c.json(data, 201)
		} catch (error) {
			return c.json(gatewayError('Vidar', error), 502)
		}
	})
	.openapi(removeBanRoute, async (c) => {
		const { ip } = c.req.valid('param')

		try {
			const client = getVidarClient()

			const res = await vidarBreaker.execute(async () => {
				const r = await client.vidar.bans[':ip'].$delete(
					{ param: { ip } },
					{ init: { signal: AbortSignal.timeout(10_000) } },
				)

				if (!r.ok && r.status >= 500) throw new Error(`Vidar returned ${r.status}`)

				return r
			})

			const data = (await res.json()) as Record<string, unknown>

			if (res.status === 404) {
				return c.json(
					{
						error: 'Not Found',
						message: (data.message as string) ?? 'Ban not found',
						statusCode: 404,
					},
					404,
				)
			}

			return c.json(data as { message: string }, 200)
		} catch (error) {
			return c.json(gatewayError('Vidar', error), 502)
		}
	})
	.openapi(ingestEventRoute, async (c) => {
		const body = c.req.valid('json')

		try {
			const client = getVidarClient()

			const data = await forwardToService(vidarBreaker, 'Vidar', SecurityEventSchema, () =>
				client.vidar.events.$post(
					{ json: body },
					{ init: { signal: AbortSignal.timeout(10_000) } },
				),
			)

			return c.json(data, 201)
		} catch (error) {
			return c.json(gatewayError('Vidar', error), 502)
		}
	})
