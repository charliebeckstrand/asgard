import { timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

export function timingSafeCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a)
	const bufB = Buffer.from(b)

	return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

export function createApiKeyAuth(getApiKey: () => string | undefined): MiddlewareHandler {
	return async (c, next) => {
		const apiKey = c.req.header('X-API-Key')

		if (!apiKey) {
			throw new HTTPException(401, { message: 'Missing API key' })
		}

		const expected = getApiKey()

		if (!expected) {
			throw new HTTPException(500, { message: 'API key is not configured' })
		}

		if (!timingSafeCompare(apiKey, expected)) {
			throw new HTTPException(401, { message: 'Invalid API key' })
		}

		await next()
	}
}
