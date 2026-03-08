import { loadEnv } from './env.js'

interface BanCheckResult {
	banned: boolean
	reason?: string
	expires_at?: string
}

/**
 * Check if an IP is banned by Vidar.
 * Returns null if Vidar is not configured or unreachable.
 */
export async function checkIpBan(ip: string): Promise<BanCheckResult | null> {
	const env = loadEnv()

	if (!env.VIDAR_URL) return null

	try {
		const url = new URL('/vidar/check-ip', env.VIDAR_URL)

		url.searchParams.set('ip', ip)

		const headers: Record<string, string> = {}

		if (env.VIDAR_API_KEY) {
			headers['X-API-Key'] = env.VIDAR_API_KEY
		}

		const res = await fetch(url, { headers, signal: AbortSignal.timeout(3000) })

		if (!res.ok) return null

		return (await res.json()) as BanCheckResult
	} catch {
		// Vidar is unreachable — fail open so auth still works
		return null
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
): void {
	const env = loadEnv()

	if (!env.VIDAR_URL) return

	const headers: Record<string, string> = { 'Content-Type': 'application/json' }

	if (env.VIDAR_API_KEY) {
		headers['X-API-Key'] = env.VIDAR_API_KEY
	}

	fetch(new URL('/vidar/events', env.VIDAR_URL), {
		method: 'POST',
		headers,
		body: JSON.stringify({ ip, event_type: eventType, details, service: 'heimdall' }),
		signal: AbortSignal.timeout(5000),
	}).catch(() => {
		// Silently ignore — Vidar being down should not affect auth
	})
}
