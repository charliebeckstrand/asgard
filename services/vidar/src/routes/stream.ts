import { OpenAPIHono } from '@hono/zod-openapi'
import { createSSEStream } from 'grid'
import type { VidarEvent } from '../lib/emitter.js'
import { eventEmitter } from '../lib/emitter.js'

const app = new OpenAPIHono()

app.get(
	'/stream',
	createSSEStream<VidarEvent>({
		emitter: eventEmitter,
		mapping: {
			data: (e) => JSON.stringify(e),
			event: (e) => e.event_type,
			id: (e) => e.id,
		},
		filter: (e, c) => {
			const eventType = c.req.query('event_type')

			return !eventType || e.event_type === eventType
		},
	}),
)

export const stream = app
