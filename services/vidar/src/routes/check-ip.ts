import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { isIpBanned } from '../handlers/bans.js'
import { CheckIpResponseSchema, errorResponse, jsonResponse } from '../lib/schemas.js'

const checkIpRoute = createRoute({
	method: 'get',
	path: '/check-ip',
	tags: ['Bans'],
	summary: 'Check if an IP is banned',
	description:
		'Returns ban status for a given IP address. Used by other services before processing requests.',
	security: [{ Bearer: [] }],
	request: {
		query: z.object({
			ip: z
				.string()
				.min(1)
				.openapi({ description: 'IP address to check', example: '192.168.1.100' }),
		}),
	},
	responses: {
		200: jsonResponse(CheckIpResponseSchema, 'Ban check result'),
		401: errorResponse('Unauthorized'),
	},
})

const app = new OpenAPIHono()

export const checkIp = app.openapi(checkIpRoute, async (c) => {
	const { ip } = c.req.valid('query')

	const result = await isIpBanned(ip)

	return c.json(result, 200)
})
