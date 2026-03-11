import { getIpAddress } from 'grid'
import type { MiddlewareHandler } from 'hono'
import { hc } from 'hono/client'
import { HTTPException } from 'hono/http-exception'
import type { VidarApp } from './app.js'
import { createTokenBucket } from './rate-limit.js'

export interface VidarClientConfig {
	vidarUrl?: string
	vidarApiKey?: string
}

let _config: VidarClientConfig = {}
let _client: ReturnType<typeof hc<VidarApp>> | null = null

export function configure(config: VidarClientConfig): void {
	_config = { ...config }

	if (config.vidarUrl) {
		_client = hc<VidarApp>(config.vidarUrl, {
			headers: config.vidarApiKey ? { Authorization: `Bearer ${config.vidarApiKey}` } : undefined,
		})
	} else {
		_client = null
	}
}

export function getConfig(): VidarClientConfig {
	return _config
}

export interface BanCheckResult {
	banned: boolean
	reason?: string
	expires_at?: string
}

/**
 * Check if an IP is banned by Vidar.
 * Returns null if Vidar is not configured or unreachable.
 */
export async function checkIpBan(ip: string): Promise<BanCheckResult | null> {
	if (!_client) return null

	try {
		const res = await _client.vidar['check-ip'].$get(
			{ query: { ip } },
			{ init: { signal: AbortSignal.timeout(3000) } },
		)

		if (!res.ok) return null

		return (await res.json()) as BanCheckResult
	} catch {
		// Vidar is unreachable — fail open so auth still works
		return null
	}
}

export function checkBan(): MiddlewareHandler {
	return async (c, next) => {
		if (!_client) {
			await next()

			return
		}

		const ip = getIpAddress(c)

		const result = await checkIpBan(ip)

		if (result?.banned) {
			throw new HTTPException(403, { message: 'Unauthorized' })
		}

		await next()
	}
}

/**
 * Report a security event to Vidar.
 * Fire-and-forget — does not throw on failure.
 */
export function reportEvent(
	eventType: string,
	ip: string,
	details: Record<string, unknown> = {},
	service = 'unknown',
): void {
	if (!_client) return

	_client.vidar.events
		.$post(
			{ json: { ip, event_type: eventType, details, service } },
			{ init: { signal: AbortSignal.timeout(5000) } },
		)
		.catch(() => {
			// Silently ignore — Vidar being down should not affect callers
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
