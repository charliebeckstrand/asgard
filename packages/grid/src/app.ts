import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { errorHandler, notFoundHandler } from './errors.js'
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
	app.use('*', secureHeaders())
	app.use('*', logger())

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
