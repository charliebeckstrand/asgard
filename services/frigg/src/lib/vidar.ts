import { loadEnv } from './env.js'

interface BanCheckResult {
	banned: boolean
	reason?: string
	expires_at?: string
}

export async function checkIpBan(ip: string): Promise<BanCheckResult | null> {
	let env: ReturnType<typeof loadEnv>

	try {
		env = loadEnv()
	} catch {
		return null
	}

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
		return null
	}
}

export function reportEvent(
	eventType: string,
	ip: string,
	details: Record<string, unknown> = {},
): void {
	let env: ReturnType<typeof loadEnv>

	try {
		env = loadEnv()
	} catch {
		return
	}

	if (!env.VIDAR_URL) return

	const headers: Record<string, string> = { 'Content-Type': 'application/json' }

	if (env.VIDAR_API_KEY) {
		headers['X-API-Key'] = env.VIDAR_API_KEY
	}

	fetch(new URL('/vidar/events', env.VIDAR_URL), {
		method: 'POST',
		headers,
		body: JSON.stringify({ ip, event_type: eventType, details, service: 'frigg' }),
		signal: AbortSignal.timeout(5000),
	}).catch(() => {})
}
