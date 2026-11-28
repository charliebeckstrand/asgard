import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, errorResponse, HTTPException, jsonResponse } from 'grid'
import { BanListSchema, MessageSchema } from 'skuld'
import { listActiveBans, removeBan } from '../handlers/bans.js'

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

const app = createRouter()

export const bans = app
	.openapi(listBansRoute, async (c) => {
		const result = await listActiveBans()

		return c.json(result, 200)
	})
	.openapi(removeBanRoute, async (c) => {
		const { ip } = c.req.valid('param')

		const removed = await removeBan(ip)

		if (!removed) {
			throw new HTTPException(404, { message: `No active ban found for IP ${ip}` })
		}

		return c.json({ message: `Ban removed for IP ${ip}` }, 200)
	})
