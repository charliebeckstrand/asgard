import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { createOpenApiConfig, errorHandler, notFoundHandler, requestLogger } from 'grid'
import { cors } from 'hono/cors'
import type { Db } from 'mimir'
import { createLogsRouter } from './routes/logs.js'

export function createLogsApp(db: Db) {
	const app = new OpenAPIHono()

	app.use('*', cors())
	app.use('*', requestLogger())

	app.route('/logs', createLogsRouter(db))

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
