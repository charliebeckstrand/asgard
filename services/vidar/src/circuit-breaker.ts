import type { Logger } from 'saga/log'

type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
	failureThreshold?: number
	halfOpenMaxAttempts?: number
	resetTimeout?: number
	/**
	 * When set, state transitions are reported here instead of
	 * console.{warn,info}. The breaker is constructed inside vidar's
	 * client (used by other services), so the consumer threads its own
	 * logger through `configureVidar({ logger })`.
	 */
	logger?: Logger
}

export interface CircuitBreakerStatus {
	failures: number
	lastFailure: number | null
	halfOpenAttempts: number
	state: CircuitState
}

export interface CircuitBreaker {
	execute<T>(fn: () => Promise<T>): Promise<T>
	getStatus(): CircuitBreakerStatus
	reset(): void
}

export function createCircuitBreaker(
	name: string,
	options: CircuitBreakerOptions = {},
): CircuitBreaker {
	const { failureThreshold = 5, resetTimeout = 30_000, halfOpenMaxAttempts = 3, logger } = options

	let failures = 0
	let lastFailure: number | null = null
	let halfOpenAttempts = 0
	let state: CircuitState = 'closed'

	function shouldAttemptReset(): boolean {
		if (state !== 'open' || lastFailure === null) return false

		return Date.now() - lastFailure >= resetTimeout
	}

	function onSuccess(): void {
		failures = 0
		halfOpenAttempts = 0
		state = 'closed'
	}

	function onFailure(): void {
		failures++

		lastFailure = Date.now()

		if (state === 'half-open') {
			halfOpenAttempts++

			if (halfOpenAttempts >= halfOpenMaxAttempts) {
				state = 'open'
			}
		} else if (failures >= failureThreshold) {
			state = 'open'

			if (logger) {
				logger.warn({ breaker: name, failures }, 'circuit breaker opened')
			} else {
				console.warn(`[vidar] Circuit breaker "${name}" opened after ${failures} failures`)
			}
		}
	}

	return {
		async execute<T>(fn: () => Promise<T>): Promise<T> {
			if (state === 'open') {
				if (shouldAttemptReset()) {
					state = 'half-open'

					halfOpenAttempts = 0

					if (logger) {
						logger.info({ breaker: name }, 'circuit breaker entering half-open')
					} else {
						console.info(`[vidar] Circuit breaker "${name}" entering half-open state`)
					}
				} else {
					throw new Error(`Circuit breaker "${name}" is open — ${name} is unavailable`)
				}
			}

			try {
				const result = await fn()

				onSuccess()

				return result
			} catch (error) {
				onFailure()

				throw error
			}
		},

		getStatus(): CircuitBreakerStatus {
			return { state, failures, lastFailure, halfOpenAttempts }
		},

		reset(): void {
			failures = 0
			lastFailure = null
			halfOpenAttempts = 0
			state = 'closed'
		},
	}
}
