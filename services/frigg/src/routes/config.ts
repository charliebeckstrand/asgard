import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getServiceConfig, getServiceNames } from '../lib/environments.js'
import { ConfigResponseSchema, ErrorSchema, ServiceListResponseSchema } from '../lib/schemas.js'
import { reportEvent } from '../lib/vidar.js'
import { apiKeyAuth } from '../middleware/api-key.js'

const ServiceParam = z.object({
	service: z.string().min(1).openapi({ description: 'Service name', example: 'heimdall' }),
})

const getConfigRoute = createRoute({
	method: 'get',
	path: '/environment/{service}',
	tags: ['Environment'],
	summary: 'Get config for a service',
	description: 'Returns all key-value pairs for the service, merged with $defaults.',
	security: [{ ApiKey: [] }],
	request: { params: ServiceParam },
	responses: {
		200: {
			content: { 'application/json': { schema: ConfigResponseSchema } },
			description: 'Config values',
			headers: {
				'Cache-Control': {
					schema: { type: 'string' },
					description: 'no-store',
				},
			},
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Service not found',
		},
	},
})

const listServicesRoute = createRoute({
	method: 'get',
	path: '/environment',
	tags: ['Environment'],
	summary: 'List configured services',
	description: 'Returns the names of all services with environment configuration.',
	security: [{ ApiKey: [] }],
	responses: {
		200: {
			content: { 'application/json': { schema: ServiceListResponseSchema } },
			description: 'Service list',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

export const config = new OpenAPIHono()

config.use('/environment/*', apiKeyAuth())
config.use('/environment', apiKeyAuth())

config.openapi(listServicesRoute, (c) => {
	const services = getServiceNames()

	return c.json({ services }, 200)
})

config.openapi(getConfigRoute, (c) => {
	const { service } = c.req.valid('param')

	const ip = c.req.header('x-forwarded-for') ?? 'unknown'

	const data = getServiceConfig(service)

	if (!data) {
		return c.json(
			{
				error: 'Not Found',
				message: `No configuration found for service '${service}'`,
				statusCode: 404,
			},
			404,
		)
	}

	reportEvent('config_read', ip, { service })

	c.header('Cache-Control', 'no-store')

	return c.json({ service, data }, 200)
})
