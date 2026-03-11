import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { createBan, listActiveBans, removeBan } from '../handlers/bans.js'
import {
	BanListSchema,
	BanSchema,
	CreateBanSchema,
	ErrorSchema,
	MessageSchema,
} from '../lib/schemas.js'
import { apiKeyAuth } from '../middleware/api-key.js'

const listBansRoute = createRoute({
	method: 'get',
	path: '/bans',
	tags: ['Bans'],
	summary: 'List active bans',
	description: 'Returns all currently active IP bans (excludes expired bans).',
	security: [{ Bearer: [] }],
	responses: {
		200: {
			content: { 'application/json': { schema: BanListSchema } },
			description: 'List of active bans',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const createBanRoute = createRoute({
	method: 'post',
	path: '/bans',
	tags: ['Bans'],
	summary: 'Manually ban an IP',
	description: 'Create a manual IP ban. Optionally specify a duration; omit for a permanent ban.',
	security: [{ Bearer: [] }],
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
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const removeBanRoute = createRoute({
	method: 'delete',
	path: '/bans/{ip}',
	tags: ['Bans'],
	summary: 'Unban an IP',
	description: 'Remove the ban for a specific IP address.',
	security: [{ Bearer: [] }],
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
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Ban not found',
		},
	},
})

const app = new OpenAPIHono()

app.use('/bans', apiKeyAuth())
app.use('/bans/*', apiKeyAuth())

export const bans = app
	.openapi(listBansRoute, async (c) => {
		const result = await listActiveBans()

		return c.json(result, 200)
	})
	.openapi(createBanRoute, async (c) => {
		const { ip, reason, duration_minutes } = c.req.valid('json')

		const ban = await createBan(ip, reason, {
			created_by: 'manual',
			duration_minutes,
		})

		return c.json(ban, 201)
	})
	.openapi(removeBanRoute, async (c) => {
		const { ip } = c.req.valid('param')

		const removed = await removeBan(ip)

		if (!removed) {
			return c.json(
				{ error: 'Not Found', message: `No active ban found for IP ${ip}`, statusCode: 404 },
				404,
			)
		}

		return c.json({ message: `Ban removed for IP ${ip}` }, 200)
	})
