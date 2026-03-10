import { timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { loadEnv } from '../lib/env.js'

export function apiKeyAuth(): MiddlewareHandler {
	return async (c, next) => {
		const env = loadEnv()
		const apiKey = c.req.header('X-API-Key')

		if (!apiKey) {
			throw new HTTPException(401, { message: 'Missing API key' })
		}

		if (!env.HUGINN_API_KEY) {
			throw new HTTPException(500, { message: 'HUGINN_API_KEY is not configured' })
		}

		const a = Buffer.from(apiKey)
		const b = Buffer.from(env.HUGINN_API_KEY)

		if (a.length !== b.length || !timingSafeEqual(a, b)) {
			throw new HTTPException(401, { message: 'Invalid API key' })
		}

		await next()
	}
}
