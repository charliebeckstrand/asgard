import { randomUUID } from 'node:crypto'
import type { JwtVariables } from 'hono/jwt'
import { sign, verify } from 'hono/jwt'
import ms from 'ms'
import { getConfig } from './config.js'

export type TokenType = 'access' | 'refresh'

export type JWTPayload = JwtVariables['jwtPayload']

export async function signToken(sub: string, type: TokenType): Promise<string> {
	const config = getConfig()

	const now = Math.floor(Date.now() / 1000)

	const expiresIn = type === 'access' ? ms('30m') / 1000 : ms('7d') / 1000

	const payload: JWTPayload = {
		sub,
		type,
		iss: 'heimdall',
		exp: now + expiresIn,
		iat: now,
		jti: randomUUID(),
	}

	return sign(payload, config.secretKey, 'HS256')
}

export async function verifyToken(token: string): Promise<JWTPayload> {
	const config = getConfig()

	const payload = await verify(token, config.secretKey, 'HS256')

	if (payload.iss !== 'heimdall') {
		throw new Error('Invalid token issuer')
	}

	return payload
}
