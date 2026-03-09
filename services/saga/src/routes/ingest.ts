import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
	BatchCreateSchema,
	CreateLogSchema,
	ErrorSchema,
	LogEntrySchema,
	SearchResultSchema,
} from '../lib/schemas.js'
import { apiKeyAuth } from '../middleware/auth.js'
import { ingestBatch, ingestLog } from '../services/ingest.js'

const ingestRoute = createRoute({
	method: 'post',
	path: '/ingest',
	tags: ['Logs'],
	summary: 'Ingest a log entry',
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

const batchIngestRoute = createRoute({
	method: 'post',
	path: '/ingest/batch',
	tags: ['Logs'],
	summary: 'Ingest multiple log entries',
	description: 'Persist multiple structured log entries in a single request',
	request: {
		body: { content: { 'application/json': { schema: BatchCreateSchema } } },
	},
	responses: {
		201: {
			content: { 'application/json': { schema: SearchResultSchema } },
			description: 'Log entries created',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

export const ingest = new OpenAPIHono()

ingest.use('/ingest', apiKeyAuth())
ingest.use('/ingest/*', apiKeyAuth())

ingest.openapi(ingestRoute, async (c) => {
	const body = c.req.valid('json')
	const entry = await ingestLog(body)

	return c.json(entry, 201)
})

ingest.openapi(batchIngestRoute, async (c) => {
	const { logs } = c.req.valid('json')
	const entries = await ingestBatch(logs)

	return c.json({ data: entries, total: entries.length }, 201)
})
