import {
	ACCESS_TOKEN_TTL_SECONDS,
	type AccessTokenPayload,
	signToken as gridSignToken,
	verifyAccessToken as gridVerifyAccessToken,
	verifyRefreshToken as gridVerifyRefreshToken,
	verifyToken as gridVerifyToken,
	type JWTPayload,
	REFRESH_TOKEN_TTL_SECONDS,
	type RefreshTokenPayload,
	TOKEN_ISSUER,
	type TokenType,
} from 'grid/auth'
import { getConfig } from './config.js'

export {
	ACCESS_TOKEN_TTL_SECONDS,
	type AccessTokenPayload,
	type JWTPayload,
	REFRESH_TOKEN_TTL_SECONDS,
	type RefreshTokenPayload,
	TOKEN_ISSUER,
	type TokenType,
}

export function signToken(sub: string, type: TokenType): Promise<string> {
	return gridSignToken(sub, type, getConfig().keys)
}

export function verifyToken(token: string): Promise<JWTPayload> {
	return gridVerifyToken(token, getConfig().keys)
}

export function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
	return gridVerifyAccessToken(token, getConfig().keys)
}

export function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
	return gridVerifyRefreshToken(token, getConfig().keys)
}
