export interface RateLimitConfig {
	/** Tokens refilled per second (default: 5) */
	rate?: number
	/** Maximum bucket size / burst capacity (default: 10) */
	burst?: number
}

interface BucketEntry {
	tokens: number
	lastRefill: number
}

const EVICT_AFTER_MS = 3_600_000 // 1 hour
const SWEEP_INTERVAL_MS = 300_000 // 5 minutes

export function createTokenBucket(config?: RateLimitConfig) {
	const rate = config?.rate ?? 5
	const burst = config?.burst ?? 10

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
