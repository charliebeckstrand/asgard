import { getIpAddress } from 'grid/middleware'
import type { MiddlewareHandler } from 'hono'
import { hc } from 'hono/client'
import { HTTPException } from 'hono/http-exception'
import type { Logger } from 'saga/log'

import type { VidarApp } from './app.js'
import { type CircuitBreaker, createCircuitBreaker } from './circuit-breaker.js'
import type { CheckIpResponse } from './lib/schemas.js'
import { createTokenBucket } from './rate-limit.js'

interface VidarClientConfig {
	vidarUrl?: string
	vidarApiKey?: string
	/**
	 * When set, the circuit breaker reports state transitions through this
	 * logger instead of console.{warn,info}. Pass the consuming service's
	 * logger so breaker events share its `service` binding.
	 */
	logger?: Logger
}

type VidarClient = ReturnType<typeof hc<VidarApp>>

let _client: VidarClient | null = null
let _breaker: CircuitBreaker | null = null

export function configure(config: VidarClientConfig): void {
	_client = config.vidarUrl
		? hc<VidarApp>(config.vidarUrl, {
				headers: config.vidarApiKey ? { Authorization: `Bearer ${config.vidarApiKey}` } : undefined,
			})
		: null

	_breaker = config.vidarUrl ? createCircuitBreaker('vidar', { logger: config.logger }) : null
}

/**
 * Run an HTTP call against Vidar through the circuit breaker.
 * Returns null when Vidar isn't configured, the breaker is open, or the
 * call throws — callers fail open so a Vidar outage can't lock them out.
 */
async function callVidar<T>(fn: (client: VidarClient) => Promise<T>): Promise<T | null> {
	const client = _client
	const breaker = _breaker

	if (!client || !breaker) return null

	try {
		return await breaker.execute(() => fn(client))
	} catch {
		return null
	}
}

async function checkIpBan(ip: string): Promise<CheckIpResponse | null> {
	return callVidar(async (client) => {
		const res = await client.vidar['check-ip'].$get(
			{ query: { ip } },
			{ init: { signal: AbortSignal.timeout(3000) } },
		)

		if (!res.ok && res.status >= 500) throw new Error(`Vidar returned ${res.status}`)
		if (!res.ok) return null

		return (await res.json()) as CheckIpResponse
	})
}

/**
 * Report a security event to Vidar.
 * Fire-and-forget — does not throw on failure.
 * Uses circuit breaker to avoid hammering an unresponsive Vidar.
 */
export function reportEvent(
	eventType: string,
	ip: string,
	details: Record<string, unknown> = {},
	service = 'unknown',
): void {
	void callVidar(async (client) => {
		const res = await client.vidar.events.$post(
			{ json: { ip, event_type: eventType, details, service } },
			{ init: { signal: AbortSignal.timeout(5000) } },
		)

		if (!res.ok && res.status >= 500) throw new Error(`Vidar returned ${res.status}`)
	})
}

export interface CreateVidarOptions {
	/** Tokens refilled per second (default: 5) */
	rate?: number
	/** Maximum bucket size / burst capacity (default: 10) */
	burst?: number
	/** Route label included in reported events (e.g., '/auth') */
	route?: string
	/** Service name included in reported events (default: 'unknown') */
	service?: string
}

/**
 * Create a unified Vidar middleware that performs ban checking and rate limiting.
 * Ban check fails open when Vidar is unreachable. Rate limiting is always enforced locally.
 */
export function createVidar(options?: CreateVidarOptions): MiddlewareHandler {
	const bucket = createTokenBucket({ rate: options?.rate, burst: options?.burst })

	const route = options?.route
	const service = options?.service ?? 'unknown'

	return async (c, next) => {
		const ip = getIpAddress(c)

		const result = await checkIpBan(ip)

		if (result?.banned) {
			throw new HTTPException(403, { message: 'Unauthorized' })
		}

		if (!bucket.consume(ip)) {
			reportEvent('rate_limited', ip, route ? { route } : {}, service)

			throw new HTTPException(429, { message: 'Too many requests' })
		}

		await next()
	}
}
