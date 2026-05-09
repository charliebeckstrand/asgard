import { Writable } from 'node:stream'
import { Hono } from 'hono'
import { pino } from 'pino'
import { type RequestLoggerEnv, requestLogger } from '../../http/request-logger.js'

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

function createTestApp() {
	const dest = new CaptureStream()

	const baseLogger = pino({ base: { service: 'test' } }, dest)

	const app = new Hono<RequestLoggerEnv>()

	app.use('*', requestLogger(baseLogger))

	return { app, dest }
}

describe('requestLogger', () => {
	it('emits an access-log line with method, path, status, and duration', async () => {
		const { app, dest } = createTestApp()

		app.get('/hello', (c) => c.text('hi'))

		const res = await app.request('/hello')

		expect(res.status).toBe(200)

		await flush()

		const lines = dest.lines()

		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({
			service: 'test',
			method: 'GET',
			path: '/hello',
			status: 200,
			msg: 'http request',
		})
		expect(typeof lines[0].requestId).toBe('string')
		expect(lines[0].durationMs).toBeTypeOf('number')
	})

	it('echoes back the X-Request-Id header on the response', async () => {
		const { app } = createTestApp()

		app.get('/', (c) => c.text('ok'))

		const res = await app.request('/')

		expect(res.headers.get('x-request-id')).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		)
	})

	it('reuses the incoming X-Request-Id when present', async () => {
		const { app, dest } = createTestApp()

		app.get('/', (c) => c.text('ok'))

		const res = await app.request('/', { headers: { 'X-Request-Id': 'incoming-42' } })

		expect(res.headers.get('x-request-id')).toBe('incoming-42')

		await flush()

		expect(dest.lines()[0]).toMatchObject({ requestId: 'incoming-42' })
	})

	it("exposes a request-scoped child logger via c.get('logger')", async () => {
		const { app, dest } = createTestApp()

		app.get('/', (c) => {
			c.get('logger').warn({ extra: 'context' }, 'route-emitted')

			return c.text('ok')
		})

		await app.request('/', { headers: { 'X-Request-Id': 'stitch-me' } })

		await flush()

		const lines = dest.lines()

		expect(lines).toHaveLength(2)
		expect(lines[0]).toMatchObject({
			level: 40,
			service: 'test',
			requestId: 'stitch-me',
			extra: 'context',
			msg: 'route-emitted',
		})
		expect(lines[1]).toMatchObject({ requestId: 'stitch-me', msg: 'http request' })
	})

	it('logs even when the handler throws', async () => {
		const { app, dest } = createTestApp()

		app.get('/boom', () => {
			throw new Error('boom')
		})

		app.onError((_err, c) => c.text('handled', 500))

		const res = await app.request('/boom')

		expect(res.status).toBe(500)

		await flush()

		const lines = dest.lines()

		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({ status: 500, msg: 'http request' })
	})
})
