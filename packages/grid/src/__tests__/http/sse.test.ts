import { EventEmitter } from 'node:events'
import { Hono } from 'hono'
import { createSSEStream } from '../../http/sse.js'

interface TestEvent {
	id: string
	type: string
}

function createStreamApp(emitter: EventEmitter) {
	const app = new Hono()

	app.get(
		'/stream',
		createSSEStream<TestEvent>({
			emitter,
			mapping: { data: (e) => JSON.stringify(e), event: (e) => e.type, id: (e) => e.id },
			keepAliveMs: 10,
		}),
	)

	return app
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, text: string) {
	const decoder = new TextDecoder()

	let received = ''

	while (!received.includes(text)) {
		const { value, done } = await reader.read()

		if (done) break

		received += decoder.decode(value)
	}

	return received
}

describe('createSSEStream', () => {
	it('sends emitted events and pings an idle stream', async () => {
		const emitter = new EventEmitter()

		const res = await createStreamApp(emitter).request('/stream')

		const reader = res.body!.getReader()

		expect(await readUntil(reader, ': ping')).toContain(': ping')

		emitter.emit('event', { id: '1', type: 'login_failed' })

		expect(await readUntil(reader, 'event: login_failed')).toContain('id: 1')

		await reader.cancel()
	})

	it('drops an event it cannot write instead of rejecting', async () => {
		const emitter = new EventEmitter()

		const unhandled = vi.fn()

		process.on('unhandledRejection', unhandled)

		const res = await createStreamApp(emitter).request('/stream')

		const reader = res.body!.getReader()

		emitter.emit('event', { id: '1', type: 'bad\nevent' })

		await readUntil(reader, ': ping')

		expect(unhandled).not.toHaveBeenCalled()

		await reader.cancel()

		process.off('unhandledRejection', unhandled)
	})

	it('stops listening once the client leaves', async () => {
		const emitter = new EventEmitter()

		const res = await createStreamApp(emitter).request('/stream')

		const reader = res.body!.getReader()

		await readUntil(reader, ': ping')

		expect(emitter.listenerCount('event')).toBe(1)

		await reader.cancel()

		await vi.waitFor(() => {
			expect(emitter.listenerCount('event')).toBe(0)
		})
	})
})
