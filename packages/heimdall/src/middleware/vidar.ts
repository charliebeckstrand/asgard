import { getIpAddress } from 'grid'
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

		const ip = getIpAddress(c)

		const result = await checkIpBan(ip)

		if (result?.banned) {
			throw new HTTPException(403, { message: 'Unauthorized' })
		}

		await next()
	}
}
