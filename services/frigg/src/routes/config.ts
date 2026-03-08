import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
	ConfigResponseSchema,
	DeleteResponseSchema,
	ErrorSchema,
	HistoryResponseSchema,
	PutConfigSchema,
	RollbackResponseSchema,
} from '../lib/schemas.js'
import { reportEvent } from '../lib/vidar.js'
import { apiKeyAuth } from '../middleware/api-key.js'
import {
	deleteConfig,
	getConfig,
	getHistory,
	putConfig,
	rollbackSecret,
} from '../services/config.js'

const NamespaceParam = z.object({
	namespace: z
		.string()
		.min(1)
		.openapi({ description: 'Environment namespace', example: 'heimdall.production' }),
})

const NamespaceKeyParam = z.object({
	namespace: z
		.string()
		.min(1)
		.openapi({ description: 'Environment namespace', example: 'heimdall.production' }),
	key: z.string().min(1).openapi({ description: 'Secret key', example: 'DATABASE_URL' }),
})

const getConfigRoute = createRoute({
	method: 'get',
	path: '/environment/{namespace}',
	tags: ['Environment'],
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
	path: '/environment/{namespace}',
	tags: ['Environment'],
	summary: 'Set secrets for a namespace',
	description:
		'Upserts key-value pairs. Values are encrypted at rest. Previous values are saved to history (1 deep).',
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

const getHistoryRoute = createRoute({
	method: 'get',
	path: '/environment/{namespace}/history',
	tags: ['Environment'],
	summary: 'Get secret history for a namespace',
	description: 'Returns the previous value for each key that has been updated. One entry per key.',
	security: [{ ApiKey: [] }],
	request: { params: NamespaceParam },
	responses: {
		200: {
			content: { 'application/json': { schema: HistoryResponseSchema } },
			description: 'History entries',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const rollbackRoute = createRoute({
	method: 'post',
	path: '/environment/{namespace}/{key}/rollback',
	tags: ['Environment'],
	summary: 'Rollback a secret to its previous value',
	description: 'Restores the previous value for a key and removes it from history.',
	security: [{ ApiKey: [] }],
	request: { params: NamespaceKeyParam },
	responses: {
		200: {
			content: { 'application/json': { schema: RollbackResponseSchema } },
			description: 'Secret rolled back',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'No history found',
		},
	},
})

const deleteNamespaceRoute = createRoute({
	method: 'delete',
	path: '/environment/{namespace}',
	tags: ['Environment'],
	summary: 'Delete all secrets in a namespace',
	description:
		'Removes all key-value pairs for the namespace. History is also deleted via cascade.',
	security: [{ ApiKey: [] }],
	request: { params: NamespaceParam },
	responses: {
		200: {
			content: { 'application/json': { schema: DeleteResponseSchema } },
			description: 'Secrets deleted',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const deleteKeyRoute = createRoute({
	method: 'delete',
	path: '/environment/{namespace}/{key}',
	tags: ['Environment'],
	summary: 'Delete a single secret',
	description: 'Removes a specific key from the namespace. History is also deleted via cascade.',
	security: [{ ApiKey: [] }],
	request: { params: NamespaceKeyParam },
	responses: {
		200: {
			content: { 'application/json': { schema: DeleteResponseSchema } },
			description: 'Secret deleted',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

export const config = new OpenAPIHono()

config.use('/environment/*', apiKeyAuth())

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

config.openapi(getHistoryRoute, async (c) => {
	const { namespace } = c.req.valid('param')
	const ip = c.req.header('x-forwarded-for') ?? 'unknown'

	const history = await getHistory(namespace)

	reportEvent('config_history_read', ip, { namespace })

	return c.json({ namespace, history }, 200)
})

config.openapi(rollbackRoute, async (c) => {
	const { namespace, key } = c.req.valid('param')
	const ip = c.req.header('x-forwarded-for') ?? 'unknown'

	const value = await rollbackSecret(namespace, key)

	if (value === null) {
		return c.json(
			{ error: 'Not Found', message: `No history found for ${namespace}/${key}`, statusCode: 404 },
			404,
		)
	}

	reportEvent('config_rollback', ip, { namespace, key })

	return c.json({ namespace, key, value }, 200)
})

config.openapi(deleteNamespaceRoute, async (c) => {
	const { namespace } = c.req.valid('param')
	const ip = c.req.header('x-forwarded-for') ?? 'unknown'

	const deleted = await deleteConfig(namespace)

	reportEvent('config_delete', ip, { namespace })

	return c.json({ deleted }, 200)
})

config.openapi(deleteKeyRoute, async (c) => {
	const { namespace, key } = c.req.valid('param')
	const ip = c.req.header('x-forwarded-for') ?? 'unknown'

	const deleted = await deleteConfig(namespace, key)

	reportEvent('config_delete', ip, { namespace, key })

	return c.json({ deleted }, 200)
})
