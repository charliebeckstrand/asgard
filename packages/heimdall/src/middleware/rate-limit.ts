import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

interface BucketEntry {
	tokens: number
	lastRefill: number
}

const buckets = new Map<string, BucketEntry>()

const RATE = 5 // tokens per second
const BURST = 10 // max bucket size

export function rateLimit(): MiddlewareHandler {
	return async (c, next) => {
		const key = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'

		const now = Date.now()

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
