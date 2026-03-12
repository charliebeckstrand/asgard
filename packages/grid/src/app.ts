import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { compress } from 'hono/compress'
import { cors } from 'hono/cors'
import { etag } from 'hono/etag'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { timing } from 'hono/timing'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { errorHandler, notFoundHandler } from './errors.js'
import { createOpenApiConfig } from './openapi.js'

interface CreateAppOptions {
	basePath: string
	title: string
	description: string
	port: number
	cors?: Parameters<typeof cors>[0]
}

export function createApp(options: CreateAppOptions) {
	const app = new OpenAPIHono()

	app.use(trimTrailingSlash())

	app.use('*', cors(options.cors ?? undefined))
	app.use('*', secureHeaders())
	app.use('*', logger())
	app.use('*', timing())
	app.use('*', compress())
	app.use('*', etag())

	const openApiConfig = createOpenApiConfig({
		title: options.title,
		description: options.description,
		port: options.port,
	})

	const setup = () => {
		app.get(options.basePath, (c) =>
			c.json({
				service: options.title.toLowerCase(),
				openApi: `${options.basePath}/openapi.json`,
				docs: `${options.basePath}/docs`,
			}),
		)

		app.get(`${options.basePath}/docs`, swaggerUI({ url: `${options.basePath}/openapi.json` }))

		app.doc(`${options.basePath}/openapi.json`, openApiConfig)

		app.onError(errorHandler)

		app.notFound(notFoundHandler)
	}

	return { app, setup }
}
