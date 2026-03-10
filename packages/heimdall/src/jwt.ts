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

const ACCESS_TOKEN_SECONDS = 30 * 60

const REFRESH_TOKEN_SECONDS = 7 * 86400

export async function signToken(sub: string, type: TokenType): Promise<string> {
	const config = getConfig()

	const now = Math.floor(Date.now() / 1000)

	const expiresIn = type === 'access' ? ACCESS_TOKEN_SECONDS : REFRESH_TOKEN_SECONDS

	const payload: Claims = {
		sub,
		type,
		iss: 'heimdall',
		exp: now + expiresIn,
		iat: now,
		jti: randomUUID(),
	}

	return sign(payload, config.secretKey, 'HS256')
}

export async function verifyToken(token: string): Promise<Claims> {
	const config = getConfig()

	const payload = await verify(token, config.secretKey, 'HS256')

	if (payload.iss !== 'heimdall') {
		throw new Error('Invalid token issuer')
	}

	return payload as unknown as Claims
}
