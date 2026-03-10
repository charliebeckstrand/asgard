import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { errorHandler, notFoundHandler } from './errors.js'
import { requestLogger, securityHeaders } from './middleware.js'
import { createOpenApiConfig } from './openapi.js'

interface CreateAppOptions {
	basePath: string
	title: string
	description: string
	cors?: Parameters<typeof cors>[0]
}

export function createApp(options: CreateAppOptions) {
	const app = new OpenAPIHono()

	app.use('*', options.cors ? cors(options.cors) : cors())
	app.use('*', securityHeaders())
	app.use('*', requestLogger())

	const openApiConfig = createOpenApiConfig({
		title: options.title,
		description: options.description,
	})

	const setup = () => {
		app.doc(`${options.basePath}/openapi.json`, openApiConfig)

		app.get(`${options.basePath}/docs`, swaggerUI({ url: `${options.basePath}/openapi.json` }))

		app.onError(errorHandler)

		app.notFound(notFoundHandler)
	}

	return { app, setup }
}
