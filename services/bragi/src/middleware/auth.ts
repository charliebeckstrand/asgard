import { verifyAccessToken } from 'grid/auth'
import type { MiddlewareHandler } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { environment } from '../lib/env.js'

export type AuthEnv = {
	Variables: {
		userId: string
	}
}

export function requireAuth(): MiddlewareHandler<AuthEnv> {
	return bearerAuth({
		verifyToken: async (token, c) => {
			try {
				const env = environment()

				const { sub } = await verifyAccessToken(token, {
					current: env.SECRET_KEY,
					previous: env.PREVIOUS_SECRET_KEY,
				})

				c.set('userId', sub)

				return true
			} catch {
				return false
			}
		},
	})
}
