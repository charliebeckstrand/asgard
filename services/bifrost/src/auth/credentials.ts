import { randomUUID } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import type { User } from 'skuld'
import { getConfig } from './config.js'
import { AuthError } from './errors.js'
import { REFRESH_TOKEN_TTL_SECONDS, signToken, verifyRefreshToken } from './jwt.js'

export { AuthError } from './errors.js'

export interface TokenPair {
	access_token: string
	refresh_token: string
	token_type: 'bearer'
	session_id: string
}

// Parallel requests (two tabs, a burst of fetches) can all present the same
// refresh token. Within this window after a rotation, the replaced token is
// answered with the session's current jti instead of being treated as stolen.
const ROTATION_GRACE_MS = 30_000

function sessionExpiry(): Date {
	return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)
}

async function issueTokenPair(userId: string, sessionId: string, jti: string): Promise<TokenPair> {
	const access_token = await signToken(userId, 'access')
	const refresh_token = await signToken(userId, 'refresh', { sid: sessionId, jti })

	return { access_token, refresh_token, token_type: 'bearer', session_id: sessionId }
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
		if (ip)
			getConfig().onSecurityEvent?.({
				type: 'login_failed',
				ip,
				details: { email: normalizedEmail },
			})

		throw new AuthError('invalid_credentials', 'Incorrect email or password')
	}

	if (!creds.is_active) {
		throw new AuthError('account_inactive', 'Account is inactive')
	}

	const sessionId = randomUUID()
	const jti = randomUUID()

	await getConfig().sessionRepository.createSession(sessionId, creds.id, jti, sessionExpiry())

	return issueTokenPair(creds.id, sessionId, jti)
}

export async function registerUser(email: string, password: string, ip?: string): Promise<User> {
	const normalizedEmail = email.trim().toLowerCase()

	const hashedPassword = await hash(password, { algorithm: 2 /* Argon2id */ })

	const { userRepository } = getConfig()

	try {
		const user = await userRepository.insertUser(randomUUID(), normalizedEmail, hashedPassword)

		if (ip)
			getConfig().onSecurityEvent?.({
				type: 'registration',
				ip,
				details: { email: normalizedEmail },
			})

		return user
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
			throw new AuthError('email_exists', 'Email already registered')
		}

		throw err
	}
}

export async function refreshTokenPair(refreshToken: string, ip?: string): Promise<TokenPair> {
	const invalid = () => new AuthError('invalid_token', 'Invalid or expired refresh token')

	const claims = await verifyRefreshToken(refreshToken).catch(() => {
		throw invalid()
	})

	const { onSecurityEvent, sessionRepository, userRepository } = getConfig()

	let jti: string = randomUUID()

	const rotated = await sessionRepository.rotateSession(
		claims.sid,
		claims.jti,
		jti,
		sessionExpiry(),
	)

	if (!rotated) {
		const session = await sessionRepository.getSession(claims.sid)

		if (!session || session.revoked_at || session.expires_at.getTime() <= Date.now()) {
			throw invalid()
		}

		const recentlyReplaced =
			session.previous_jti === claims.jti &&
			session.rotated_at !== null &&
			Date.now() - session.rotated_at.getTime() < ROTATION_GRACE_MS

		if (!recentlyReplaced) {
			// A stale refresh token came back: someone else may hold this session.
			await sessionRepository.revokeSession(session.id)

			if (ip)
				onSecurityEvent?.({
					type: 'refresh_token_reused',
					ip,
					details: { userId: session.user_id, sessionId: session.id },
				})

			throw invalid()
		}

		jti = session.refresh_jti
	}

	const user = await userRepository.getUserById(claims.sub)

	if (!user || !user.is_active) {
		throw invalid()
	}

	return issueTokenPair(user.id, claims.sid, jti)
}

export function revokeSession(sessionId: string): Promise<void> {
	return getConfig().sessionRepository.revokeSession(sessionId)
}

export function revokeUserSessions(userId: string): Promise<void> {
	return getConfig().sessionRepository.revokeUserSessions(userId)
}
