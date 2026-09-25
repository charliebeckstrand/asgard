import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { errorResponse, HTTPException, jsonRequest, jsonResponse } from 'grid'
import { IdSchema, IpAddressSchema } from 'skuld'
import { listThreats, setThreatResolved } from '../handlers/threats.js'
import { ResolveThreatSchema, ThreatListSchema, ThreatSchema } from '../lib/schemas.js'

const listThreatsRoute = createRoute({
	method: 'get',
	path: '/threats',
	tags: ['Threats'],
	summary: 'List detected threats',
	description: 'Returns detected threat incidents, optionally filtered by resolution status or IP.',
	security: [{ Bearer: [] }],
	request: {
		query: z.object({
			resolved: z
				.enum(['true', 'false'])
				.optional()
				.openapi({ description: 'Filter by resolved status' }),
			ip: IpAddressSchema.optional().openapi({ description: 'Filter by IP address' }),
		}),
	},
	responses: {
		200: jsonResponse(ThreatListSchema, 'List of threats'),
		401: errorResponse('Unauthorized'),
	},
})

const resolveThreatRoute = createRoute({
	method: 'patch',
	path: '/threats/{id}',
	tags: ['Threats'],
	summary: 'Resolve or reopen a threat',
	description: 'Marks a threat as handled, or reopens it.',
	security: [{ Bearer: [] }],
	request: {
		params: z.object({ id: IdSchema }),
		body: jsonRequest(ResolveThreatSchema),
	},
	responses: {
		200: jsonResponse(ThreatSchema, 'Threat updated'),
		401: errorResponse('Unauthorized'),
		404: errorResponse('Threat not found'),
	},
})

const app = new OpenAPIHono()

export const threats = app
	.openapi(listThreatsRoute, async (c) => {
		const { resolved, ip } = c.req.valid('query')

		const result = await listThreats({
			resolved: resolved !== undefined ? resolved === 'true' : undefined,
			ip,
		})

		return c.json(result, 200)
	})
	.openapi(resolveThreatRoute, async (c) => {
		const { id } = c.req.valid('param')
		const { resolved } = c.req.valid('json')

		const threat = await setThreatResolved(id, resolved)

		if (!threat) {
			throw new HTTPException(404, { message: `No threat found with id ${id}` })
		}

		return c.json(threat, 200)
	})
