import { createBearerAuth } from 'grid/middleware'
import { createMiddleware } from 'hono/factory'
import { environment } from '../lib/env.js'

export const apiKeyAuth = () =>
	createMiddleware(async (c, next) => {
		const key = environment().VIDAR_API_KEY

		if (!key) return next()

		return createBearerAuth(() => key)(c, next)
	})
