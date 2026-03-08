import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { ConfigResponseSchema, ErrorSchema, PutConfigSchema } from '../lib/schemas.js'
import { reportEvent } from '../lib/vidar.js'
import { apiKeyAuth } from '../middleware/api-key.js'
import { getConfig, putConfig } from '../services/config.js'

const NamespaceParam = z.object({
	namespace: z
		.string()
		.min(1)
		.openapi({ description: 'Config namespace', example: 'heimdall.production' }),
})

const getConfigRoute = createRoute({
	method: 'get',
	path: '/config/{namespace}',
	tags: ['Secrets'],
	summary: 'Get secrets for a namespace',
	description: 'Returns all key-value pairs for the namespace, decrypted.',
	security: [{ ApiKey: [] }],
	request: { params: NamespaceParam },
	responses: {
		200: {
			content: { 'application/json': { schema: ConfigResponseSchema } },
			description: 'Secret values',
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
	},
})

const putConfigRoute = createRoute({
	method: 'put',
	path: '/config/{namespace}',
	tags: ['Secrets'],
	summary: 'Set secrets for a namespace',
	description: 'Upserts key-value pairs. Values are encrypted at rest.',
	security: [{ ApiKey: [] }],
	request: {
		params: NamespaceParam,
		body: {
			content: { 'application/json': { schema: PutConfigSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { 'application/json': { schema: ConfigResponseSchema } },
			description: 'Secrets updated',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

export const config = new OpenAPIHono()

config.use('/config/*', apiKeyAuth())

config.openapi(getConfigRoute, async (c) => {
	const { namespace } = c.req.valid('param')
	const ip = c.req.header('x-forwarded-for') ?? 'unknown'

	const data = await getConfig(namespace)

	reportEvent('config_read', ip, { namespace })

	c.header('Cache-Control', 'no-store')

	return c.json({ namespace, data }, 200)
})

config.openapi(putConfigRoute, async (c) => {
	const { namespace } = c.req.valid('param')
	const ip = c.req.header('x-forwarded-for') ?? 'unknown'
	const body = c.req.valid('json')

	await putConfig(namespace, body)

	const data = await getConfig(namespace)

	reportEvent('config_write', ip, { namespace, keys: Object.keys(body) })

	return c.json({ namespace, data }, 200)
})
