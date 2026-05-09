import { randomUUID } from 'node:crypto'
import type { JwtVariables } from 'hono/jwt'
import { sign, verify } from 'hono/jwt'

export type TokenType = 'access' | 'refresh'

export type JWTPayload = JwtVariables['jwtPayload']

export const TOKEN_ISSUER = 'heimdall'

export const ACCESS_TOKEN_TTL_SECONDS = 30 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60

const TOKEN_TTL_SECONDS: Record<TokenType, number> = {
	access: ACCESS_TOKEN_TTL_SECONDS,
	refresh: REFRESH_TOKEN_TTL_SECONDS,
}

export class InvalidTokenError extends Error {
	constructor(message = 'Invalid token') {
		super(message)
		this.name = 'InvalidTokenError'
	}
}

export async function signToken(sub: string, type: TokenType, secret: string): Promise<string> {
	const now = Math.floor(Date.now() / 1000)

	const payload: JWTPayload = {
		sub,
		type,
		iss: TOKEN_ISSUER,
		exp: now + TOKEN_TTL_SECONDS[type],
		iat: now,
		jti: randomUUID(),
	}

	return sign(payload, secret, 'HS256')
}

export async function verifyToken(token: string, secret: string): Promise<JWTPayload> {
	const payload = await verify(token, secret, 'HS256')

	if (payload.iss !== TOKEN_ISSUER) {
		throw new InvalidTokenError('Invalid token issuer')
	}

	return payload
}

export type AccessTokenPayload = JWTPayload & { sub: string; type: 'access' }

export async function verifyAccessToken(
	token: string,
	secret: string,
): Promise<AccessTokenPayload> {
	const payload = await verifyToken(token, secret)

	if (payload.type !== 'access' || typeof payload.sub !== 'string') {
		throw new InvalidTokenError('Invalid token')
	}

	return payload as AccessTokenPayload
}
