import type { z } from '@hono/zod-openapi'
import { HTTPException } from 'grid'
import type { Context, MiddlewareHandler } from 'hono'
import { type Role, UserSchema } from 'skuld'

/**
 * Bifrost checks the session and forwards its user in this header, as JSON.
 * Mimir trusts it because the request also carries the API key, which only
 * bifrost holds.
 */
const USER_HEADER = 'x-mimir-user'

const ForwardedUserSchema = UserSchema.pick({ id: true, roles: true, is_verified: true })

type ForwardedUser = z.infer<typeof ForwardedUserSchema>

export type UserEnv = {
	Variables: {
		user: ForwardedUser | null
	}
}

function parse(header: string | undefined): ForwardedUser | null {
	if (!header) return null

	try {
		const parsed = ForwardedUserSchema.safeParse(JSON.parse(header))

		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

/**
 * Reads the forwarded user, and marks every response as one user's data, so no
 * cache serves it to another.
 */
export function forwardedUser(): MiddlewareHandler<UserEnv> {
	return async (c, next) => {
		c.set('user', parse(c.req.header(USER_HEADER)))

		await next()

		c.header('cache-control', 'private, no-store')
	}
}

/** The signed-in user, or a 401. */
export function requireUser(c: Context<UserEnv>): ForwardedUser {
	const user = c.get('user')

	if (!user) throw new HTTPException(401, { message: 'Not authenticated' })

	return user
}

/**
 * Lets through a user with `role` and a verified email, so an account made in
 * seconds with an address nobody checked can't fill the database. `admin` isn't
 * accepted: it also needs the second step, which Mimir doesn't see.
 */
export function requireRole(role: Exclude<Role, 'admin'>): MiddlewareHandler<UserEnv> {
	return async (c, next) => {
		const user = requireUser(c)

		if (!user.roles.includes(role)) {
			throw new HTTPException(403, { message: `The ${role} role is required` })
		}

		if (!user.is_verified) {
			throw new HTTPException(403, { message: 'Verify your email to make changes' })
		}

		await next()
	}
}
