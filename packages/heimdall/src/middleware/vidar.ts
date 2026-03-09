import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getConfig } from '../config.js'
import { checkIpBan } from '../vidar.js'

export function vidarBanCheck(): MiddlewareHandler {
	return async (c, next) => {
		const config = getConfig()

		if (!config.vidarUrl) {
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
