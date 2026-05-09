import { HttpError } from 'grid'
import type { Context, MiddlewareHandler } from 'hono'
import { verify } from 'hono/jwt'
import { environment } from '../lib/env.js'

export type AuthEnv = {
	Variables: {
		userId: string
	}
}

export function requireAuth(): MiddlewareHandler<AuthEnv> {
	return async (c: Context<AuthEnv>, next) => {
		const header = c.req.header('Authorization')

		if (!header?.startsWith('Bearer ')) {
			throw new HttpError(401, 'Missing bearer token', 'Unauthorized')
		}

		const token = header.slice('Bearer '.length)

		let payload: Awaited<ReturnType<typeof verify>>

		try {
			payload = await verify(token, environment().SECRET_KEY, 'HS256')
		} catch {
			throw new HttpError(401, 'Invalid token', 'Unauthorized')
		}

		if (
			payload.iss !== 'heimdall' ||
			payload.type !== 'access' ||
			typeof payload.sub !== 'string'
		) {
			throw new HttpError(401, 'Invalid token', 'Unauthorized')
		}

		c.set('userId', payload.sub)

		return next()
	}
}
