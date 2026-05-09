import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { errorResponse, HttpError, jsonRequest, jsonResponse } from 'grid'
import { BanListSchema, BanSchema, CreateBanSchema, MessageSchema } from 'skuld'
import { createBan, listActiveBans, removeBan } from '../handlers/bans.js'

const listBansRoute = createRoute({
	method: 'get',
	path: '/bans',
	tags: ['Bans'],
	summary: 'List active bans',
	description: 'Returns all currently active IP bans (excludes expired bans).',
	security: [{ Bearer: [] }],
	responses: {
		200: jsonResponse(BanListSchema, 'List of active bans'),
		401: errorResponse('Unauthorized'),
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
		body: jsonRequest(CreateBanSchema),
	},
	responses: {
		201: jsonResponse(BanSchema, 'Ban created'),
		401: errorResponse('Unauthorized'),
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
		200: jsonResponse(MessageSchema, 'Ban removed'),
		401: errorResponse('Unauthorized'),
		404: errorResponse('Ban not found'),
	},
})

const app = new OpenAPIHono()

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
			throw new HttpError(404, `No active ban found for IP ${ip}`, 'Not Found')
		}

		return c.json({ message: `Ban removed for IP ${ip}` }, 200)
	})
