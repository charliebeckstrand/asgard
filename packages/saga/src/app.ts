import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { createOpenApiConfig, errorHandler, notFoundHandler, requestLogger } from 'grid'
import { cors } from 'hono/cors'
import type { Pool } from 'pg'

import { createLogsRouter } from './routes/logs.js'

export function createLogsApp(pool: Pool) {
	const app = new OpenAPIHono()

	app.use('*', cors())
	app.use('*', requestLogger())

	app.route('/logs', createLogsRouter(pool))

	app.doc(
		'/logs/openapi.json',
		createOpenApiConfig({
			title: 'Saga',
			description: 'Structured log ingestion and querying',
		}),
	)

	app.get('/logs/docs', swaggerUI({ url: '/logs/openapi.json' }))

	app.onError(errorHandler)

	app.notFound(notFoundHandler)

	return app
}
