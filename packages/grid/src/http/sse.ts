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

export function createSSEStream<T>(options: CreateSSEStreamOptions<T>): (c: Context) => Response {
	const { emitter, mapping, filter, keepAliveMs = 30_000 } = options

	return (c: Context) => {
		return streamSSE(c, async (stream) => {
			const handler = (event: T) => {
				if (filter && !filter(event, c)) return

				// writeSSE rejects an event or id holding a line break. Unhandled, that
				// rejection would end the process.
				stream
					.writeSSE({
						data: mapping.data(event),
						event: mapping.event(event),
						id: mapping.id(event),
					})
					.catch(() => {})
			}

			emitter.on('event', handler)

			stream.onAbort(() => {
				emitter.off('event', handler)
			})

			// A comment line keeps proxies from closing an idle stream. The loop
			// ends with the stream, so a closed one holds nothing.
			while (!stream.aborted) {
				await stream.sleep(keepAliveMs)

				await stream.write(': ping\n\n')
			}
		})
	}
}
