import { getIpAddress } from 'grid'
import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

interface BucketEntry {
	tokens: number
	lastRefill: number
}

export interface RateLimitOptions {
	/** Tokens refilled per second (default: 5) */
	rate?: number
	/** Maximum bucket size / burst capacity (default: 10) */
	burst?: number
	/** Called when a request is rate-limited */
	onLimit?: (ip: string) => void
}

const EVICT_AFTER_MS = 3_600_000 // 1 hour
const SWEEP_INTERVAL_MS = 300_000 // 5 minutes

export function rateLimit(options?: RateLimitOptions): MiddlewareHandler {
	const rate = options?.rate ?? 5
	const burst = options?.burst ?? 10

	const onLimit = options?.onLimit

	const buckets = new Map<string, BucketEntry>()

	let lastSweep = Date.now()

	return async (c, next) => {
		const key = getIpAddress(c)

		const now = Date.now()

		if (now - lastSweep > SWEEP_INTERVAL_MS) {
			lastSweep = now

			for (const [k, v] of buckets) {
				if (now - v.lastRefill > EVICT_AFTER_MS) {
					buckets.delete(k)
				}
			}
		}

		let entry = buckets.get(key)

		if (!entry) {
			entry = { tokens: burst, lastRefill: now }

			buckets.set(key, entry)
		}

		const elapsed = (now - entry.lastRefill) / 1000

		entry.tokens = Math.min(burst, entry.tokens + elapsed * rate)

		entry.lastRefill = now

		if (entry.tokens < 1) {
			onLimit?.(key)

			throw new HTTPException(429, { message: 'Too many requests' })
		}

		entry.tokens -= 1

		await next()
	}
}
