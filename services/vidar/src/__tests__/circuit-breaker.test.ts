import { createCircuitBreaker } from '@/circuit-breaker'

describe('circuit breaker', () => {
	it('starts in closed state', () => {
		const breaker = createCircuitBreaker('test')

		const status = breaker.getStatus()

		expect(status.state).toBe('closed')

		expect(status.failures).toBe(0)
	})

	it('stays closed on successful calls', async () => {
		const breaker = createCircuitBreaker('test')

		await breaker.execute(async () => 'ok')

		expect(breaker.getStatus().state).toBe('closed')
	})

	it('opens after reaching failure threshold', async () => {
		const breaker = createCircuitBreaker('test', { failureThreshold: 3 })

		for (let i = 0; i < 3; i++) {
			await breaker
				.execute(async () => {
					throw new Error('fail')
				})
				.catch(() => {})
		}

		expect(breaker.getStatus().state).toBe('open')

		expect(breaker.getStatus().failures).toBe(3)
	})

	it('rejects calls when open', async () => {
		const breaker = createCircuitBreaker('test', { failureThreshold: 1, resetTimeout: 60_000 })

		await breaker
			.execute(async () => {
				throw new Error('fail')
			})
			.catch(() => {})

		expect(breaker.getStatus().state).toBe('open')

		await expect(breaker.execute(async () => 'ok')).rejects.toThrow(
			'Circuit breaker "test" is open',
		)
	})

	it('transitions to half-open after reset timeout', async () => {
		const breaker = createCircuitBreaker('test', { failureThreshold: 1, resetTimeout: 0 })

		await breaker
			.execute(async () => {
				throw new Error('fail')
			})
			.catch(() => {})

		expect(breaker.getStatus().state).toBe('open')

		const result = await breaker.execute(async () => 'recovered')

		expect(result).toBe('recovered')

		expect(breaker.getStatus().state).toBe('closed')
	})

	it('reopens from half-open after too many failures', async () => {
		const breaker = createCircuitBreaker('test', {
			failureThreshold: 1,
			resetTimeout: 0,
			halfOpenMaxAttempts: 2,
		})

		await breaker
			.execute(async () => {
				throw new Error('fail')
			})
			.catch(() => {})

		expect(breaker.getStatus().state).toBe('open')

		// First half-open attempt fails
		await breaker
			.execute(async () => {
				throw new Error('still failing')
			})
			.catch(() => {})

		expect(breaker.getStatus().state).toBe('half-open')

		// Second half-open attempt fails — should reopen
		await breaker
			.execute(async () => {
				throw new Error('still failing')
			})
			.catch(() => {})

		expect(breaker.getStatus().state).toBe('open')
	})

	it('resets state', async () => {
		const breaker = createCircuitBreaker('test', { failureThreshold: 1 })

		await breaker
			.execute(async () => {
				throw new Error('fail')
			})
			.catch(() => {})

		expect(breaker.getStatus().state).toBe('open')

		breaker.reset()

		expect(breaker.getStatus().state).toBe('closed')

		expect(breaker.getStatus().failures).toBe(0)
	})

	it('reports open and half-open transitions through the provided logger', async () => {
		const logger = {
			warn: vi.fn(),
			info: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
			fatal: vi.fn(),
			trace: vi.fn(),
			child: vi.fn(),
		}

		const breaker = createCircuitBreaker('vidar', {
			failureThreshold: 1,
			resetTimeout: 0,
			// biome-ignore lint/suspicious/noExplicitAny: minimal logger stub
			logger: logger as any,
		})

		await breaker
			.execute(async () => {
				throw new Error('fail')
			})
			.catch(() => {})

		expect(logger.warn).toHaveBeenCalledWith(
			{ breaker: 'vidar', failures: 1 },
			'circuit breaker opened',
		)

		await breaker.execute(async () => 'recovered')

		expect(logger.info).toHaveBeenCalledWith(
			{ breaker: 'vidar' },
			'circuit breaker entering half-open',
		)
	})

	it('falls back to console when no logger is provided', async () => {
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const breaker = createCircuitBreaker('test', { failureThreshold: 1, resetTimeout: 60_000 })

		await breaker
			.execute(async () => {
				throw new Error('fail')
			})
			.catch(() => {})

		expect(consoleWarn).toHaveBeenCalledWith(
			'[vidar] Circuit breaker "test" opened after 1 failures',
		)

		consoleWarn.mockRestore()
	})

	it('resets failure count on success', async () => {
		const breaker = createCircuitBreaker('test', { failureThreshold: 5 })

		await breaker
			.execute(async () => {
				throw new Error('fail')
			})
			.catch(() => {})

		await breaker
			.execute(async () => {
				throw new Error('fail')
			})
			.catch(() => {})

		expect(breaker.getStatus().failures).toBe(2)

		await breaker.execute(async () => 'ok')

		expect(breaker.getStatus().failures).toBe(0)
	})
})
