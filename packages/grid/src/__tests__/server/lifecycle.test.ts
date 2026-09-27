import type { Server } from 'node:net'
import { setupLifecycle } from '../../server/lifecycle.js'

function fakeServer(close: (done: (error?: Error) => void) => void) {
	return { on: vi.fn(), close: vi.fn(close) } as unknown as Server
}

describe('setupLifecycle', () => {
	beforeEach(() => {
		vi.useFakeTimers()

		vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

		vi.spyOn(console, 'log').mockImplementation(() => {})

		vi.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		vi.useRealTimers()

		vi.restoreAllMocks()

		process.removeAllListeners('SIGTERM')

		process.removeAllListeners('SIGINT')
	})

	it('runs onShutdown and exits cleanly once the server closes', async () => {
		const onShutdown = vi.fn().mockResolvedValue(undefined)

		setupLifecycle({ server: fakeServer((done) => done()), name: 'Test', onShutdown })

		process.emit('SIGTERM')

		await vi.waitFor(() => {
			expect(process.exit).toHaveBeenCalledWith(0)
		})

		expect(onShutdown).toHaveBeenCalledOnce()
	})

	it('exits with an error when the server does not close in time', () => {
		setupLifecycle({ server: fakeServer(() => {}), name: 'Test' })

		process.emit('SIGTERM')

		vi.advanceTimersByTime(10_000)

		expect(process.exit).toHaveBeenCalledWith(1)
	})
})
