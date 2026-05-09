import { timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'

export function timingSafeCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a)
	const bufB = Buffer.from(b)

	return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

export function createBearerAuth(getToken: () => string | undefined): MiddlewareHandler {
	return bearerAuth({
		verifyToken: (token) => {
			const expected = getToken()

			if (!expected) return false

			return timingSafeCompare(token, expected)
		},
	})
}
