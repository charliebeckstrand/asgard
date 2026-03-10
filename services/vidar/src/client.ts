import { getIpAddress } from 'grid'
import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

export interface VidarClientConfig {
	vidarUrl?: string
	vidarApiKey?: string
}

let _config: VidarClientConfig = {}

export function configure(config: VidarClientConfig): void {
	_config = { ...config }
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
	if (!_config.vidarUrl) return null

	try {
		const url = new URL('/vidar/check-ip', _config.vidarUrl)

		url.searchParams.set('ip', ip)

		const headers: Record<string, string> = {}

		if (_config.vidarApiKey) {
			headers['X-API-Key'] = _config.vidarApiKey
		}

		const res = await fetch(url, { headers, signal: AbortSignal.timeout(3000) })

		if (!res.ok) return null

		return (await res.json()) as BanCheckResult
	} catch {
		// Vidar is unreachable — fail open so auth still works
		return null
	}
}

export function checkBan(): MiddlewareHandler {
	return async (c, next) => {
		if (!_config.vidarUrl) {
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
	if (!_config.vidarUrl) return

	const headers: Record<string, string> = { 'Content-Type': 'application/json' }

	if (_config.vidarApiKey) {
		headers['X-API-Key'] = _config.vidarApiKey
	}

	fetch(new URL('/vidar/events', _config.vidarUrl), {
		method: 'POST',
		headers,
		body: JSON.stringify({ ip, event_type: eventType, details, service }),
		signal: AbortSignal.timeout(5000),
	}).catch(() => {
		// Silently ignore — Vidar being down should not affect callers
	})
}
