import { Writable } from 'node:stream'
import { createLogger } from '../log/index.js'

class CaptureStream extends Writable {
	chunks: string[] = []

	override _write(chunk: Buffer | string, _enc: BufferEncoding, cb: () => void) {
		this.chunks.push(chunk.toString())

		cb()
	}

	lines(): Array<Record<string, unknown>> {
		return this.chunks
			.flatMap((c) => c.split('\n'))
			.filter(Boolean)
			.map((line) => JSON.parse(line) as Record<string, unknown>)
	}
}

function flush() {
	return new Promise((resolve) => setImmediate(resolve))
}

describe('createLogger', () => {
	it('emits a JSON line per log call with service binding', async () => {
		const dest = new CaptureStream()

		const log = createLogger({ service: 'test', destination: dest })

		log.info('hello')
		log.error({ code: 'X' }, 'bad')

		await flush()

		const lines = dest.lines()

		expect(lines).toHaveLength(2)
		expect(lines[0]).toMatchObject({ level: 'info', msg: 'hello', service: 'test' })
		expect(lines[1]).toMatchObject({ level: 'error', msg: 'bad', code: 'X', service: 'test' })
	})

	it('emits ISO-8601 timestamps under the `time` key', async () => {
		const dest = new CaptureStream()

		const log = createLogger({ service: 'test', destination: dest })

		log.info('tick')

		await flush()

		const time = dest.lines()[0].time

		expect(typeof time).toBe('string')
		expect(time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
	})

	it('respects the level option', async () => {
		const dest = new CaptureStream()

		const log = createLogger({ service: 'test', level: 'warn', destination: dest })

		log.debug('dropped-debug')
		log.info('dropped-info')
		log.warn('kept-warn')
		log.error('kept-error')

		await flush()

		const messages = dest.lines().map((l) => l.msg)

		expect(messages).toEqual(['kept-warn', 'kept-error'])
	})

	it('child loggers inherit bindings and add their own', async () => {
		const dest = new CaptureStream()

		const log = createLogger({ service: 'test', destination: dest })

		const child = log.child({ requestId: 'req-1' })

		child.info('hello')

		await flush()

		expect(dest.lines()[0]).toMatchObject({
			service: 'test',
			requestId: 'req-1',
			msg: 'hello',
		})
	})
})
