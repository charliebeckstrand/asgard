import {
	ACCESS_TOKEN_TTL_SECONDS,
	type AccessTokenPayload,
	signToken as gridSignToken,
	verifyAccessToken as gridVerifyAccessToken,
	verifyToken as gridVerifyToken,
	type JWTPayload,
	parseJwtPayload,
	REFRESH_TOKEN_TTL_SECONDS,
	RefreshTokenPayloadSchema,
	type TokenType,
} from 'grid/auth'
import { z } from 'zod'
import { getConfig } from './config.js'

export { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS }

// Refresh tokens name their session and the jti it currently expects.
const SessionRefreshTokenPayloadSchema = RefreshTokenPayloadSchema.extend({
	sid: z.uuid(),
	jti: z.uuid(),
})

export type SessionRefreshTokenPayload = z.infer<typeof SessionRefreshTokenPayloadSchema>

export function signToken(
	sub: string,
	type: TokenType,
	claims?: Record<string, unknown>,
): Promise<string> {
	return gridSignToken(sub, type, getConfig().keys, claims)
}

export function verifyToken(token: string): Promise<JWTPayload> {
	return gridVerifyToken(token, getConfig().keys)
}

export function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
	return gridVerifyAccessToken(token, getConfig().keys)
}

export function verifyRefreshToken(token: string): Promise<SessionRefreshTokenPayload> {
	return parseJwtPayload(token, getConfig().keys, SessionRefreshTokenPayloadSchema)
}
