import {
	ACCESS_TOKEN_TTL_SECONDS,
	signToken as gridSignToken,
	verifyToken as gridVerifyToken,
	type JWTPayload,
	REFRESH_TOKEN_TTL_SECONDS,
	TOKEN_ISSUER,
	type TokenType,
} from 'grid/auth'
import { getConfig } from './config.js'

export {
	ACCESS_TOKEN_TTL_SECONDS,
	type JWTPayload,
	REFRESH_TOKEN_TTL_SECONDS,
	TOKEN_ISSUER,
	type TokenType,
}

export function signToken(sub: string, type: TokenType): Promise<string> {
	return gridSignToken(sub, type, getConfig().secretKey)
}

export function verifyToken(token: string): Promise<JWTPayload> {
	return gridVerifyToken(token, getConfig().secretKey)
}
