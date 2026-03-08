import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { loadEnv } from '../lib/env.js'

export function apiKeyAuth(): MiddlewareHandler {
	const env = loadEnv()

	return async (c, next) => {
		const apiKey = c.req.header('X-API-Key')

		if (!apiKey) {
			throw new HTTPException(401, { message: 'Missing API key' })
		}

		if (!env.VIDAR_API_KEY) {
			throw new HTTPException(500, { message: 'VIDAR_API_KEY is not configured' })
		}

		if (apiKey !== env.VIDAR_API_KEY) {
			throw new HTTPException(401, { message: 'Invalid API key' })
		}

		await next()
	}
}
