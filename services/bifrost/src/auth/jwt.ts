import { randomUUID } from 'node:crypto'
import type { JwtVariables } from 'hono/jwt'
import { sign, verify } from 'hono/jwt'
import ms from 'ms'
import { getConfig } from './config.js'
import { AuthError } from './errors.js'

export type TokenType = 'access' | 'refresh'

export type JWTPayload = JwtVariables['jwtPayload']

export const ACCESS_TOKEN_TTL_SECONDS = ms('30m') / 1000
export const REFRESH_TOKEN_TTL_SECONDS = ms('7d') / 1000

const TOKEN_TTL_SECONDS: Record<TokenType, number> = {
	access: ACCESS_TOKEN_TTL_SECONDS,
	refresh: REFRESH_TOKEN_TTL_SECONDS,
}

export const TOKEN_ISSUER = 'heimdall'

export async function signToken(sub: string, type: TokenType): Promise<string> {
	const config = getConfig()

	const now = Math.floor(Date.now() / 1000)

	const payload: JWTPayload = {
		sub,
		type,
		iss: TOKEN_ISSUER,
		exp: now + TOKEN_TTL_SECONDS[type],
		iat: now,
		jti: randomUUID(),
	}

	return sign(payload, config.secretKey, 'HS256')
}

export async function verifyToken(token: string): Promise<JWTPayload> {
	const config = getConfig()

	const payload = await verify(token, config.secretKey, 'HS256')

	if (payload.iss !== TOKEN_ISSUER) {
		throw new AuthError('invalid_token', 'Invalid token issuer')
	}

	return payload
}
