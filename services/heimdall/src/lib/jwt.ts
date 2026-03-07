import { randomUUID } from "node:crypto"
import jwt from "jsonwebtoken"
import { loadEnv } from "./env.js"

export type TokenType = "access" | "refresh"

export interface Claims {
	sub: string
	type: TokenType
	exp: number
	iat: number
	jti: string
}

export function signToken(sub: string, type: TokenType): { token: string; expiresIn: number } {
	const env = loadEnv()
	const expiresIn =
		type === "access" ? env.ACCESS_TOKEN_EXPIRE_MINUTES * 60 : env.REFRESH_TOKEN_EXPIRE_DAYS * 86400
	const now = Math.floor(Date.now() / 1000)

	const payload: Claims = {
		sub,
		type,
		exp: now + expiresIn,
		iat: now,
		jti: randomUUID(),
	}

	const token = jwt.sign(payload, env.SECRET_KEY, { algorithm: "HS256" })
	return { token, expiresIn }
}

export function verifyToken(token: string): Claims {
	const env = loadEnv()
	return jwt.verify(token, env.SECRET_KEY, { algorithms: ["HS256"] }) as Claims
}
