import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { Db } from 'mimir'
import {
	BatchCreateSchema,
	CreateLogSchema,
	ErrorSchema,
	LogEntrySchema,
	LogListSchema,
	LogQuerySchema,
} from '../lib/schemas.js'
import { createBatch, createLog, queryLogs } from '../services/logs.js'

const listRoute = createRoute({
	method: 'get',
	path: '/',
	tags: ['Logs'],
	summary: 'List logs',
	description: 'Query stored logs with optional filters for type, level, service, and time range',
	request: {
		query: LogQuerySchema,
	},
	responses: {
		200: {
			content: { 'application/json': { schema: LogListSchema } },
			description: 'Log entries',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const createRoute_ = createRoute({
	method: 'post',
	path: '/',
	tags: ['Logs'],
	summary: 'Create a log entry',
	description: 'Persist a single structured log entry',
	request: {
		body: { content: { 'application/json': { schema: CreateLogSchema } } },
	},
	responses: {
		201: {
			content: { 'application/json': { schema: LogEntrySchema } },
			description: 'Log entry created',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const batchCreateRoute = createRoute({
	method: 'post',
	path: '/batch',
	tags: ['Logs'],
	summary: 'Create multiple log entries',
	description: 'Persist multiple structured log entries in a single request',
	request: {
		body: { content: { 'application/json': { schema: BatchCreateSchema } } },
	},
	responses: {
		201: {
			content: { 'application/json': { schema: LogListSchema } },
			description: 'Log entries created',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

export function createLogsRouter(db: Db) {
	const logs = new OpenAPIHono()

	logs.openapi(listRoute, async (c) => {
		const query = c.req.valid('query')

		const result = await queryLogs(db, query)

		return c.json(result, 200)
	})

	logs.openapi(createRoute_, async (c) => {
		const body = c.req.valid('json')

		const entry = await createLog(db, body)

		return c.json(entry, 201)
	})

	logs.openapi(batchCreateRoute, async (c) => {
		const { logs: logEntries } = c.req.valid('json')

		const entries = await createBatch(db, logEntries)

		return c.json({ data: entries, total: entries.length }, 201)
	})

	return logs
}
