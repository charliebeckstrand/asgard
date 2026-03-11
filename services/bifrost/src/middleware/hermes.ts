import { getIpAddress } from 'grid/middleware'
import { createHermesClient } from 'hermes/client'
import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { createTokenBucket } from './rate-limit.js'

let _client: ReturnType<typeof createHermesClient> | null = null

export function configureHermes(baseUrl: string): void {
	_client = createHermesClient(baseUrl)
}

export function getClient() {
	if (!_client) {
		throw new Error('Hermes client not configured — call configureHermes() first')
	}

	return _client
}

/**
 * Check if an IP is banned via Hermes RPC.
 * Returns null if Hermes is unreachable (fail-open).
 */
async function checkIpBan(ip: string): Promise<{ is_banned: boolean } | null> {
	if (!_client) return null

	try {
		const res = await _client.rpc.security['check-ip'].$get(
			{ query: { ip } },
			{ init: { signal: AbortSignal.timeout(3000) } },
		)

		if (!res.ok) return null

		return (await res.json()) as { is_banned: boolean }
	} catch {
		return null
	}
}

/**
 * Report a security event via Hermes RPC.
 * Fire-and-forget — does not throw on failure.
 */
export function reportEvent(
	eventType: string,
	ip: string,
	details: Record<string, unknown> = {},
	service = 'unknown',
): void {
	if (!_client) return

	_client.rpc.security.events
		.$post(
			{ json: { ip, event_type: eventType, details, service } },
			{ init: { signal: AbortSignal.timeout(5000) } },
		)
		.catch(() => {
			// Silently ignore — Hermes being down should not affect callers
		})
}

export interface CreateHermesMiddlewareOptions {
	/** Tokens refilled per second (default: 5) */
	rate?: number
	/** Maximum bucket size / burst capacity (default: 10) */
	burst?: number
	/** Route label included in reported events (e.g., '/auth') */
	route?: string
	/** Service name included in reported events (default: 'bifrost') */
	service?: string
}

/**
 * Middleware that performs ban checking via Hermes and local rate limiting.
 * Ban check fails open when Hermes is unreachable. Rate limiting is always enforced locally.
 */
export function createHermesGuard(options?: CreateHermesMiddlewareOptions): MiddlewareHandler {
	const bucket = createTokenBucket({ rate: options?.rate, burst: options?.burst })

	const route = options?.route
	const service = options?.service ?? 'bifrost'

	return async (c, next) => {
		const ip = getIpAddress(c)

		const result = await checkIpBan(ip)

		if (result?.is_banned) {
			throw new HTTPException(403, { message: 'Unauthorized' })
		}

		if (!bucket.consume(ip)) {
			reportEvent('rate_limited', ip, route ? { route } : {}, service)

			throw new HTTPException(429, { message: 'Too many requests' })
		}

		await next()
	}
}
