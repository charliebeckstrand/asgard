import type { createNodeWebSocket } from '@hono/node-ws'
import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'

import { openApiConfig } from './lib/openapi.js'
import { requestLogger } from './middleware/logger.js'
import { broadcastMessage } from './routes/broadcast.js'
import { channels } from './routes/channels.js'
import { health } from './routes/health.js'
import { sendMessage } from './routes/send.js'
import { createWsHandler } from './ws/handler.js'

export function createApp(getWs: () => ReturnType<typeof createNodeWebSocket>) {
	const app = new OpenAPIHono()

	// --- Global middleware ---

	app.use('*', cors())
	app.use('*', requestLogger())

	// --- Routes ---

	app.route('/messages', health)
	app.route('/messages', sendMessage)
	app.route('/messages', broadcastMessage)
	app.route('/messages', channels)

	// --- WebSocket ---

	const getWsHandler = createWsHandler(getWs)
	app.get('/messages/ws', getWsHandler())

	// --- OpenAPI ---

	app.doc('/messages/openapi.json', openApiConfig)

	app.get('/messages/docs', swaggerUI({ url: '/messages/openapi.json' }))

	// --- Error handling ---

	app.onError((err, c) => {
		if (err instanceof HTTPException) {
			return c.json(
				{
					error: err.name,
					message: err.message,
					statusCode: err.status,
				},
				err.status,
			)
		}

		console.error(`Unhandled error: ${err.message}`, err.stack)

		return c.json(
			{
				error: 'Internal Server Error',
				message: err.message,
				statusCode: 500,
			},
			500,
		)
	})

	app.notFound((c) => {
		return c.json(
			{
				error: 'Not Found',
				message: `Route ${c.req.method} ${c.req.path} not found`,
				statusCode: 404,
			},
			404,
		)
	})

	return app
}
