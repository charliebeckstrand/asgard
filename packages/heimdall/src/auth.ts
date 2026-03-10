import { randomUUID } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import { getConfig } from './config.js'
import { signToken, verifyToken } from './jwt.js'
import type { UserRow } from './types.js'
import { reportEvent } from './vidar.js'

export interface TokenPair {
	access_token: string
	refresh_token: string
	token_type: 'bearer'
	expires_in: number
}

export class AuthError extends Error {
	constructor(
		public code: 'invalid_credentials' | 'account_inactive' | 'email_exists' | 'invalid_token',
		message: string,
	) {
		super(message)
		this.name = 'AuthError'
	}
}

// Pre-compute a dummy hash for timing-safe login.
// Ensures argon2 always runs even when the user is not found,
// preventing timing-based email enumeration.
const dummyHashPromise = hash('dummy-timing-pad', { algorithm: 2 /* Argon2id */ })

export async function authenticateUser(
	email: string,
	password: string,
	ip?: string,
): Promise<TokenPair> {
	const normalizedEmail = email.trim().toLowerCase()

	const { userRepository } = getConfig()

	const creds = await userRepository.getCredentialsByEmail(normalizedEmail)

	const dummyHash = await dummyHashPromise

	const hashToVerify = creds?.hashed_password ?? dummyHash

	const passwordOk = await verify(hashToVerify, password)

	if (!creds || !passwordOk) {
		if (ip) reportEvent('login_failed', ip, { email: normalizedEmail })

		throw new AuthError('invalid_credentials', 'Incorrect email or password')
	}

	if (!creds.is_active) {
		throw new AuthError('account_inactive', 'Account is inactive')
	}

	const access = await signToken(creds.id, 'access')
	const refresh = await signToken(creds.id, 'refresh')

	return {
		access_token: access.token,
		refresh_token: refresh.token,
		token_type: 'bearer',
		expires_in: access.expiresIn,
	}
}

export async function registerUser(email: string, password: string, ip?: string): Promise<UserRow> {
	const normalizedEmail = email.trim().toLowerCase()

	const hashedPassword = await hash(password, { algorithm: 2 /* Argon2id */ })

	const { userRepository } = getConfig()

	try {
		const user = await userRepository.insertUser(randomUUID(), normalizedEmail, hashedPassword)

		if (ip) reportEvent('registration', ip, { email: normalizedEmail })

		return user
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
			throw new AuthError('email_exists', 'Email already registered')
		}

		throw err
	}
}

export async function verifyAccessToken(token: string): Promise<UserRow> {
	let claims: Awaited<ReturnType<typeof verifyToken>>

	try {
		claims = await verifyToken(token)
	} catch {
		throw new AuthError('invalid_token', 'Invalid or expired token')
	}

	if (claims.type !== 'access') {
		throw new AuthError('invalid_token', 'Invalid token type')
	}

	const { userRepository } = getConfig()

	const user = await userRepository.getUserById(claims.sub)

	if (!user || !user.is_active) {
		throw new AuthError('invalid_token', 'Invalid or expired token')
	}

	return user
}

export async function refreshTokenPair(refreshToken: string): Promise<TokenPair> {
	let claims: Awaited<ReturnType<typeof verifyToken>>

	try {
		claims = await verifyToken(refreshToken)
	} catch {
		throw new AuthError('invalid_token', 'Invalid or expired refresh token')
	}

	if (claims.type !== 'refresh') {
		throw new AuthError('invalid_token', 'Invalid or expired refresh token')
	}

	const { userRepository } = getConfig()

	const user = await userRepository.getUserById(claims.sub)

	if (!user || !user.is_active) {
		throw new AuthError('invalid_token', 'Invalid or expired refresh token')
	}

	const access = await signToken(user.id, 'access')
	const newRefresh = await signToken(user.id, 'refresh')

	return {
		access_token: access.token,
		refresh_token: newRefresh.token,
		token_type: 'bearer',
		expires_in: access.expiresIn,
	}
}
