import { randomUUID } from 'node:crypto'
import { sign, verify } from 'hono/jwt'
import { getConfig } from './config.js'

export type TokenType = 'access' | 'refresh'

export interface Claims {
	sub: string
	type: TokenType
	iss: string
	exp: number
	iat: number
	jti: string
}

export async function signToken(
	sub: string,
	type: TokenType,
): Promise<{ token: string; expiresIn: number }> {
	const config = getConfig()

	const expiresIn =
		type === 'access' ? config.accessTokenExpireMinutes * 60 : config.refreshTokenExpireDays * 86400

	const now = Math.floor(Date.now() / 1000)

	const payload: Claims = {
		sub,
		type,
		iss: 'heimdall',
		exp: now + expiresIn,
		iat: now,
		jti: randomUUID(),
	}

	const token = await sign(payload, config.secretKey, 'HS256')

	return { token, expiresIn }
}

export async function verifyToken(token: string): Promise<Claims> {
	const config = getConfig()

	const payload = await verify(token, config.secretKey, 'HS256')

	if (payload.iss !== 'heimdall') {
		throw new Error('Invalid token issuer')
	}

	return payload as unknown as Claims
}
