import { timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getConfig } from '../config.js'

export function apiKeyAuth(): MiddlewareHandler {
	return async (c, next) => {
		const config = getConfig()

		if (!config.apiKey) {
			await next()

			return
		}

		const provided = c.req.header('x-api-key') ?? ''

		const a = Buffer.from(provided)
		const b = Buffer.from(config.apiKey)

		if (a.length !== b.length || !timingSafeEqual(a, b)) {
			throw new HTTPException(401, { message: 'Invalid or missing API key' })
		}

		await next()
	}
}
