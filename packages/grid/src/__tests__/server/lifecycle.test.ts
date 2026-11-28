import type { Server } from 'node:net'
import type { Logger } from 'pino'
import { setupLifecycle } from '../../server/lifecycle.js'

function fakeServer(close: () => Promise<void>) {
	return { on: vi.fn(), [Symbol.asyncDispose]: vi.fn(close) } as unknown as Server
}

const logger = { info: vi.fn(), warn: vi.fn(), fatal: vi.fn() } as unknown as Logger

describe('setupLifecycle', () => {
	beforeEach(() => {
		vi.useFakeTimers()

		vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
	})

	afterEach(() => {
		vi.useRealTimers()

		vi.restoreAllMocks()

		vi.clearAllMocks()

		process.removeAllListeners('SIGTERM')

		process.removeAllListeners('SIGINT')
	})

	it('runs onShutdown and exits cleanly once the server closes', async () => {
		const onShutdown = vi.fn().mockResolvedValue(undefined)

		setupLifecycle({ server: fakeServer(async () => {}), logger, onShutdown })

		process.emit('SIGTERM')

		await vi.waitFor(() => {
			expect(process.exit).toHaveBeenCalledWith(0)
		})

		expect(onShutdown).toHaveBeenCalledOnce()

		expect(logger.info).toHaveBeenCalledWith({ signal: 'SIGTERM' }, 'shut down')
	})

	it('exits with an error when the server does not close in time', () => {
		setupLifecycle({ server: fakeServer(() => new Promise(() => {})), logger })

		process.emit('SIGTERM')

		vi.advanceTimersByTime(10_000)

		expect(process.exit).toHaveBeenCalledWith(1)

		expect(logger.fatal).toHaveBeenCalled()
	})
})
