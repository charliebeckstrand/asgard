type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
	failureThreshold?: number
	resetTimeout?: number
	halfOpenMaxAttempts?: number
}

export interface CircuitBreakerStatus {
	state: CircuitState
	failures: number
	lastFailure: number | null
	halfOpenAttempts: number
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
	const { failureThreshold = 5, resetTimeout = 30_000, halfOpenMaxAttempts = 3 } = options

	let state: CircuitState = 'closed'
	let failures = 0
	let lastFailure: number | null = null
	let halfOpenAttempts = 0

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

			console.warn(`[hermes] Circuit breaker "${name}" opened after ${failures} failures`)
		}
	}

	return {
		async execute<T>(fn: () => Promise<T>): Promise<T> {
			if (state === 'open') {
				if (shouldAttemptReset()) {
					state = 'half-open'
					halfOpenAttempts = 0

					console.info(`[hermes] Circuit breaker "${name}" entering half-open state`)
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
			state = 'closed'
			failures = 0
			lastFailure = null
			halfOpenAttempts = 0
		},
	}
}
