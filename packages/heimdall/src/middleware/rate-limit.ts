import { getClientIp } from 'grid'
import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

interface BucketEntry {
	tokens: number
	lastRefill: number
}

const buckets = new Map<string, BucketEntry>()

const RATE = 5 // tokens per second
const BURST = 10 // max bucket size
const EVICT_AFTER_MS = 3_600_000 // 1 hour
const SWEEP_INTERVAL_MS = 300_000 // 5 minutes

let lastSweep = Date.now()

export function rateLimit(): MiddlewareHandler {
	return async (c, next) => {
		const key = getClientIp(c)

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
			entry = { tokens: BURST, lastRefill: now }

			buckets.set(key, entry)
		}

		const elapsed = (now - entry.lastRefill) / 1000

		entry.tokens = Math.min(BURST, entry.tokens + elapsed * RATE)

		entry.lastRefill = now

		if (entry.tokens < 1) {
			throw new HTTPException(429, { message: 'Too many requests' })
		}

		entry.tokens -= 1

		await next()
	}
}
