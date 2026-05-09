import { randomUUID } from 'node:crypto'
import type { JwtVariables } from 'hono/jwt'
import { sign, verify } from 'hono/jwt'
import { z } from 'zod'

export type TokenType = 'access' | 'refresh'

export type JWTPayload = JwtVariables['jwtPayload']

export const TOKEN_ISSUER = 'heimdall'

export const ACCESS_TOKEN_TTL_SECONDS = 30 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60

const TOKEN_TTL_SECONDS: Record<TokenType, number> = {
	access: ACCESS_TOKEN_TTL_SECONDS,
	refresh: REFRESH_TOKEN_TTL_SECONDS,
}

/**
 * Symmetric signing key set with rolling rotation. New tokens are signed
 * with `current`; verification accepts either `current` or `previous`.
 *
 * Rotation procedure:
 *   1. Set `previous` to the active key, `current` to a freshly generated key.
 *   2. Redeploy. Tokens minted before the rotation still verify against
 *      `previous`; new tokens are signed with `current`.
 *   3. After every `previous`-signed token has expired (max refresh TTL),
 *      drop `previous`.
 */
export interface JwtKeys {
	current: string
	previous?: string
}

export class InvalidTokenError extends Error {
	constructor(message = 'Invalid token') {
		super(message)
		this.name = 'InvalidTokenError'
	}
}

export async function signToken(sub: string, type: TokenType, keys: JwtKeys): Promise<string> {
	const now = Math.floor(Date.now() / 1000)

	const payload: JWTPayload = {
		sub,
		type,
		iss: TOKEN_ISSUER,
		exp: now + TOKEN_TTL_SECONDS[type],
		iat: now,
		jti: randomUUID(),
	}

	return sign(payload, keys.current, 'HS256')
}

async function verifyWithKey(token: string, key: string): Promise<JWTPayload> {
	const payload = await verify(token, key, 'HS256')

	if (payload.iss !== TOKEN_ISSUER) {
		throw new InvalidTokenError('Invalid token issuer')
	}

	return payload
}

export async function verifyToken(token: string, keys: JwtKeys): Promise<JWTPayload> {
	try {
		return await verifyWithKey(token, keys.current)
	} catch (err) {
		if (keys.previous) {
			try {
				return await verifyWithKey(token, keys.previous)
			} catch {
				throw err
			}
		}

		throw err
	}
}

const tokenPayloadShape = {
	sub: z.string(),
	iss: z.literal(TOKEN_ISSUER),
	exp: z.number(),
	iat: z.number(),
	jti: z.string().optional(),
}

export const AccessTokenPayloadSchema = z.object({
	...tokenPayloadShape,
	type: z.literal('access'),
})

export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>

export const RefreshTokenPayloadSchema = z.object({
	...tokenPayloadShape,
	type: z.literal('refresh'),
})

export type RefreshTokenPayload = z.infer<typeof RefreshTokenPayloadSchema>

export async function parseJwtPayload<S extends z.ZodType>(
	token: string,
	keys: JwtKeys,
	schema: S,
): Promise<z.infer<S>> {
	const payload = await verifyToken(token, keys)

	const parsed = schema.safeParse(payload)

	if (!parsed.success) {
		throw new InvalidTokenError('Invalid token payload')
	}

	return parsed.data
}

export function verifyAccessToken(token: string, keys: JwtKeys): Promise<AccessTokenPayload> {
	return parseJwtPayload(token, keys, AccessTokenPayloadSchema)
}

export function verifyRefreshToken(token: string, keys: JwtKeys): Promise<RefreshTokenPayload> {
	return parseJwtPayload(token, keys, RefreshTokenPayloadSchema)
}
