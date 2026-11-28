import type { Logger } from 'grid/log'
import { createCircuitBreaker } from '../circuit-breaker.js'

function makeLogger() {
	return { warn: vi.fn(), info: vi.fn() }
}

function make(options: { failureThreshold?: number; resetTimeout?: number } = {}) {
	const logger = makeLogger()

	const breaker = createCircuitBreaker('test', {
		logger: logger as unknown as Logger,
		failureThreshold: 2,
		resetTimeout: 1000,
		...options,
	})

	return { breaker, logger }
}

const fail = () => Promise.reject(new Error('down'))

async function openBreaker(breaker: ReturnType<typeof make>['breaker'], times = 2) {
	for (let i = 0; i < times; i++) {
		await breaker.execute(fail).catch(() => {})
	}
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
	vi.useRealTimers()
})

describe('createCircuitBreaker', () => {
	it('passes results and errors through while closed', async () => {
		const { breaker } = make()

		expect(await breaker.execute(() => Promise.resolve('ok'))).toBe('ok')

		await expect(breaker.execute(fail)).rejects.toThrow('down')
	})

	it('opens after the threshold of failures in a row, and logs it', async () => {
		const { breaker, logger } = make()

		await openBreaker(breaker)

		const fn = vi.fn().mockResolvedValue('ok')

		await expect(breaker.execute(fn)).rejects.toThrow('is open')

		expect(fn).not.toHaveBeenCalled()

		expect(logger.warn).toHaveBeenCalledOnce()
	})

	it('counts only failures in a row', async () => {
		const { breaker } = make()

		await breaker.execute(fail).catch(() => {})

		await breaker.execute(() => Promise.resolve('ok'))

		await breaker.execute(fail).catch(() => {})

		expect(await breaker.execute(() => Promise.resolve('still closed'))).toBe('still closed')
	})

	it('lets one probe through after the timeout and rejects the rest meanwhile', async () => {
		const { breaker } = make()

		await openBreaker(breaker)

		vi.advanceTimersByTime(1000)

		const { promise, resolve } = Promise.withResolvers<string>()

		const probe = breaker.execute(() => promise)

		const other = vi.fn().mockResolvedValue('ok')

		await expect(breaker.execute(other)).rejects.toThrow('is open')

		expect(other).not.toHaveBeenCalled()

		resolve('back')

		expect(await probe).toBe('back')
	})

	it('closes when the probe succeeds, and logs it', async () => {
		const { breaker, logger } = make()

		await openBreaker(breaker)

		vi.advanceTimersByTime(1000)

		await breaker.execute(() => Promise.resolve('ok'))

		expect(logger.info).toHaveBeenCalledWith({ breaker: 'test' }, 'circuit breaker closed')

		expect(await breaker.execute(() => Promise.resolve('closed'))).toBe('closed')
	})

	it('opens again when the probe fails', async () => {
		const { breaker, logger } = make()

		await openBreaker(breaker)

		vi.advanceTimersByTime(1000)

		await breaker.execute(fail).catch(() => {})

		const fn = vi.fn().mockResolvedValue('ok')

		await expect(breaker.execute(fn)).rejects.toThrow('is open')

		expect(fn).not.toHaveBeenCalled()

		expect(logger.warn).toHaveBeenCalledTimes(2)
	})
})
