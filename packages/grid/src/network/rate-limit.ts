import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { getIpAddress } from './ip.js'

export interface RateLimitOptions {
	/** Tokens refilled per second */
	rate: number
	/** Maximum bucket size / burst capacity */
	burst: number
	/** Called with the client address each time a request is turned away */
	onLimited?: (ip: string) => void
}

interface TokenBucket {
	/** Consume one token for the given key. Returns false when the bucket is empty. */
	consume(key: string): boolean
}

interface BucketEntry {
	tokens: number
	lastRefill: number
}

const EVICT_AFTER_MS = 3_600_000 // 1 hour
const SWEEP_INTERVAL_MS = 300_000 // 5 minutes

export function createTokenBucket({ rate, burst }: { rate: number; burst: number }): TokenBucket {
	const buckets = new Map<string, BucketEntry>()

	let lastSweep = Date.now()

	return {
		consume(key: string): boolean {
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
				return false
			}

			entry.tokens -= 1

			return true
		},
	}
}

/**
 * Hono middleware that limits requests per client address with an in-memory
 * token bucket, answering 429 once the bucket is empty. Needs the clientIp middleware.
 * Each call has its own bucket, so reuse one instance to share a budget across routes.
 */
export function rateLimit({ rate, burst, onLimited }: RateLimitOptions): MiddlewareHandler {
	const bucket = createTokenBucket({ rate, burst })

	return async (c, next) => {
		const ip = getIpAddress(c)

		if (!bucket.consume(ip)) {
			onLimited?.(ip)

			throw new HTTPException(429, { message: 'Too many requests' })
		}

		await next()
	}
}
