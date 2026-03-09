import { randomUUID } from 'node:crypto'
import { getConfig } from './config.js'

export type TokenType = 'access' | 'refresh'

export interface Claims {
	sub: string
	type: TokenType
	exp: number
	iat: number
	jti: string
}

const encoder = new TextEncoder()

const JWT_HEADER = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
	.replace(/=/g, '')
	.replace(/\+/g, '-')
	.replace(/\//g, '_')

function toBase64Url(buffer: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(buffer)))
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
}

function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
	const base64 =
		str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)

	const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

	return new Uint8Array(bytes.buffer as ArrayBuffer)
}

async function getKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify'],
	)
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
		exp: now + expiresIn,
		iat: now,
		jti: randomUUID(),
	}

	const payloadB64 = btoa(JSON.stringify(payload))
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')

	const data = `${JWT_HEADER}.${payloadB64}`

	const key = await getKey(config.secretKey)

	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))

	const token = `${data}.${toBase64Url(signature)}`

	return { token, expiresIn }
}

export async function verifyToken(token: string): Promise<Claims> {
	const config = getConfig()

	const parts = token.split('.')

	if (parts.length !== 3) {
		throw new Error('Invalid token format')
	}

	const [header, payload, signature] = parts

	const data = `${header}.${payload}`

	const key = await getKey(config.secretKey)

	const valid = await crypto.subtle.verify(
		'HMAC',
		key,
		fromBase64Url(signature),
		encoder.encode(data),
	)

	if (!valid) {
		throw new Error('Invalid token signature')
	}

	const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Claims

	if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) {
		throw new Error('Token expired')
	}

	return claims
}
