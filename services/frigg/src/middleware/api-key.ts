import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { timingSafeCompare } from '../lib/crypto.js'
import { loadEnv } from '../lib/env.js'
import { reportEvent } from '../lib/vidar.js'

export function apiKeyAuth(): MiddlewareHandler {
	return async (c, next) => {
		const apiKey = c.req.header('X-API-Key')
		const ip = c.req.header('x-forwarded-for') ?? 'unknown'

		if (!apiKey) {
			reportEvent('config_auth_failed', ip, { reason: 'missing_api_key' })
			throw new HTTPException(401, { message: 'Missing API key' })
		}

		const env = loadEnv()

		if (!env.FRIGG_API_KEY) {
			throw new HTTPException(500, { message: 'FRIGG_API_KEY is not configured' })
		}

		if (!timingSafeCompare(apiKey, env.FRIGG_API_KEY)) {
			reportEvent('config_auth_failed', ip, { reason: 'invalid_api_key' })
			throw new HTTPException(401, { message: 'Invalid API key' })
		}

		await next()
	}
}
