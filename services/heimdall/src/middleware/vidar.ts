import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { loadEnv } from '../lib/env.js'
import { checkIpBan } from '../lib/vidar.js'

export function vidarBanCheck(): MiddlewareHandler {
	return async (c, next) => {
		const env = loadEnv()

		if (!env.VIDAR_URL) {
			await next()

			return
		}

		const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'

		const result = await checkIpBan(ip)

		if (result?.banned) {
			throw new HTTPException(403, { message: `Access denied: ${result.reason}` })
		}

		await next()
	}
}
