import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { getConfig } from './config.js'

export type TokenType = 'access' | 'refresh'

export interface Claims {
	sub: string
	type: TokenType
	exp: number
	iat: number
	jti: string
}

export function signToken(sub: string, type: TokenType): { token: string; expiresIn: number } {
	const config = getConfig()

	const expiresIn =
		type === 'access' ? config.accessTokenExpireMinutes * 60 : config.refreshTokenExpireDays * 86400

	const now = Math.floor(Date.now() / 1000)

	const payload: Claims = {
		sub,
		type,
		exp: now + expiresIn,
		iat: now,
		jti: randomUUID(),
	}

	const token = jwt.sign(payload, config.secretKey, { algorithm: 'HS256' })

	return { token, expiresIn }
}

export function verifyToken(token: string): Claims {
	const config = getConfig()

	return jwt.verify(token, config.secretKey, { algorithms: ['HS256'] }) as Claims
}
