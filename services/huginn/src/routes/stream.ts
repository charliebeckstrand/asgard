import { OpenAPIHono } from '@hono/zod-openapi'
import { createSSEStream } from 'grid'
import type { HuginnEvent } from '../lib/emitter.js'
import { eventEmitter } from '../lib/emitter.js'
import { apiKeyAuth } from '../middleware/auth.js'

const app = new OpenAPIHono()

app.use('/stream', apiKeyAuth())

app.get(
	'/stream',
	createSSEStream<HuginnEvent>({
		emitter: eventEmitter,
		mapping: {
			data: (e) => JSON.stringify(e),
			event: (e) => e.topic,
			id: (e) => e.id,
		},
		filter: (e, c) => {
			const topic = c.req.query('topic')

			return !topic || e.topic === topic
		},
	}),
)

export const eventStream = app
