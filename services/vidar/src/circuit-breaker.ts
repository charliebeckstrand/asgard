import type { Logger } from 'saga/log'

export interface CircuitBreakerOptions {
	logger: Logger
	/** Failures in a row that open the breaker. */
	failureThreshold?: number
	/** How long it stays open before one call may probe. */
	resetTimeout?: number
}

export interface CircuitBreaker {
	execute<T>(fn: () => Promise<T>): Promise<T>
}

/**
 * Stops calling a dependency that keeps failing. After `failureThreshold`
 * failures in a row it opens and rejects calls at once. After `resetTimeout`
 * it lets one call through as a probe and rejects the rest until the probe
 * closes it or opens it again.
 */
export function createCircuitBreaker(name: string, options: CircuitBreakerOptions): CircuitBreaker {
	const { logger, failureThreshold = 5, resetTimeout = 30_000 } = options

	let failures = 0
	let openedAt: number | null = null
	let probing = false

	return {
		async execute<T>(fn: () => Promise<T>): Promise<T> {
			const isProbe = openedAt !== null

			if (openedAt !== null) {
				if (probing || Date.now() - openedAt < resetTimeout) {
					throw new Error(`Circuit breaker "${name}" is open`)
				}

				probing = true
			}

			try {
				const result = await fn()

				if (openedAt !== null) logger.info({ breaker: name }, 'circuit breaker closed')

				failures = 0

				openedAt = null

				return result
			} catch (error) {
				failures++

				if (isProbe || (openedAt === null && failures >= failureThreshold)) {
					openedAt = Date.now()

					logger.warn({ breaker: name, failures }, 'circuit breaker opened')
				}

				throw error
			} finally {
				if (isProbe) probing = false
			}
		},
	}
}
