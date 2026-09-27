import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, errorResponse, HTTPException, jsonRequest, jsonResponse } from 'grid'
import {
	BanListSchema,
	IdSchema,
	IpAddressSchema,
	ResolveThreatSchema,
	ThreatListSchema,
	ThreatSchema,
} from 'skuld'
import { listBans, listThreats, removeBan, resolveThreat } from 'vidar/client'
import { logger } from '../lib/log.js'
import { requireRole, requireSession, type SessionEnv } from '../middleware/session.js'

// Admins read and act on Vidar through here, so Vidar itself stays off the
// internet and its API key never leaves the server.

const unavailable = errorResponse('Security monitoring is unavailable')

const listThreatsRoute = createRoute({
	method: 'get',
	path: '/threats',
	tags: ['Security'],
	summary: 'List detected threats',
	description: 'Newest first, at most 100.',
	request: {
		query: z.object({
			resolved: z
				.enum(['true', 'false'])
				.optional()
				.openapi({ description: 'Only resolved, or only open, threats' }),
		}),
	},
	responses: {
		200: jsonResponse(ThreatListSchema, 'Threats'),
		503: unavailable,
	},
})

const resolveThreatRoute = createRoute({
	method: 'patch',
	path: '/threats/{id}',
	tags: ['Security'],
	summary: 'Resolve or reopen a threat',
	request: {
		params: z.object({ id: IdSchema }),
		body: jsonRequest(ResolveThreatSchema),
	},
	responses: {
		200: jsonResponse(ThreatSchema, 'Threat updated'),
		404: errorResponse('Threat not found'),
		503: unavailable,
	},
})

const listBansRoute = createRoute({
	method: 'get',
	path: '/bans',
	tags: ['Security'],
	summary: 'List the bans in force',
	responses: {
		200: jsonResponse(BanListSchema, 'Bans'),
		503: unavailable,
	},
})

const removeBanRoute = createRoute({
	method: 'delete',
	path: '/bans/{ip}',
	tags: ['Security'],
	summary: 'Lift a ban',
	request: {
		params: z.object({ ip: IpAddressSchema }),
	},
	responses: {
		204: { description: 'Ban lifted' },
		404: errorResponse('Address not banned'),
		503: unavailable,
	},
})

const securityRoutes = createRouter<SessionEnv>()

securityRoutes.use('*', requireRole('admin'))

securityRoutes.openapi(listThreatsRoute, async (c) => {
	const { resolved } = c.req.valid('query')

	return c.json(await listThreats(resolved === undefined ? undefined : resolved === 'true'), 200)
})

securityRoutes.openapi(resolveThreatRoute, async (c) => {
	const { id } = c.req.valid('param')
	const { resolved } = c.req.valid('json')

	const threat = await resolveThreat(id, resolved)

	if (!threat) {
		throw new HTTPException(404, { message: 'Threat not found' })
	}

	return c.json(threat, 200)
})

securityRoutes.openapi(listBansRoute, async (c) => {
	return c.json(await listBans(), 200)
})

securityRoutes.openapi(removeBanRoute, async (c) => {
	const { ip } = c.req.valid('param')

	if (!(await removeBan(ip))) {
		throw new HTTPException(404, { message: 'Address not banned' })
	}

	logger().info({ ip, adminId: requireSession(c).user.id }, 'ban lifted')

	return c.body(null, 204)
})

export { securityRoutes }
