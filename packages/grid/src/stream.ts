import type { EventEmitter } from 'node:events'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'

interface SSEMapping<T> {
	data: (event: T) => string
	event: (event: T) => string
	id: (event: T) => string
}

interface CreateSSEStreamOptions<T> {
	emitter: EventEmitter
	mapping: SSEMapping<T>
	filter?: (event: T, c: Context) => boolean
	keepAliveMs?: number
}

export function createSSEStream<T>(options: CreateSSEStreamOptions<T>) {
	const { emitter, mapping, filter, keepAliveMs = 30_000 } = options

	return (c: Context) => {
		return streamSSE(c, async (stream) => {
			const handler = (event: T) => {
				if (filter && !filter(event, c)) return

				stream.writeSSE({
					data: mapping.data(event),
					event: mapping.event(event),
					id: mapping.id(event),
				})
			}

			emitter.on('event', handler)

			stream.onAbort(() => {
				emitter.off('event', handler)
			})

			while (true) {
				await stream.sleep(keepAliveMs)
			}
		})
	}
}
