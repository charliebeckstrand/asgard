import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { isIpBanned } from '../handlers/bans.js'
import { CheckIpResponseSchema, ErrorSchema } from '../lib/schemas.js'
import { apiKeyAuth } from '../middleware/api-key.js'

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
		200: {
			content: { 'application/json': { schema: CheckIpResponseSchema } },
			description: 'Ban check result',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const app = new OpenAPIHono()

app.use('/check-ip', apiKeyAuth())

export const checkIp = app.openapi(checkIpRoute, async (c) => {
	const { ip } = c.req.valid('query')

	const result = await isIpBanned(ip)

	return c.json(result, 200)
})
