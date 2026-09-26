import { createHash, randomBytes } from 'node:crypto'
import type { Session } from 'skuld'
import { getConfig } from './config.js'
import { AuthError } from './errors.js'

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

export const MAX_SESSIONS_PER_USER = 10

export const RECENT_SIGN_IN_SECONDS = 10 * 60

/**
 * Sessions are opaque: the cookie holds 32 random bytes and the database holds
 * only their SHA-256, so a leaked table can't be replayed.
 */
export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex')
}

/**
 * Starts a session for `userId`. When the browser still presents a session
 * (`replacingToken`), that one is deleted, so signing in again never leaves a
 * stray row behind.
 */
export async function createSession(
	userId: string,
	replacingToken?: string,
): Promise<{ token: string; session: Session }> {
	const token = randomBytes(32).toString('base64url')

	const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

	const session = await getConfig().sessionRepository.createSession(
		hashToken(token),
		userId,
		expiresAt,
		{
			replacing: replacingToken ? hashToken(replacingToken) : undefined,
			limit: MAX_SESSIONS_PER_USER,
		},
	)

	return { token, session }
}

export function findSession(token: string): Promise<Session | null> {
	return getConfig().sessionRepository.findSession(hashToken(token))
}

export function deleteSession(id: string): Promise<void> {
	return getConfig().sessionRepository.deleteSession(id)
}

/** Signs the user out everywhere, or everywhere but `except`. */
export function deleteUserSessions(userId: string, except?: string): Promise<void> {
	return getConfig().sessionRepository.deleteUserSessions(userId, { except })
}

export function deleteExpiredSessions(): Promise<number> {
	return getConfig().sessionRepository.deleteExpiredSessions()
}

/**
 * Passkey changes need a session started in the last ten minutes, so a stolen
 * session can't add a passkey of its own and keep the account.
 */
export function requireRecentSignIn(session: Session): void {
	const age = Date.now() - new Date(session.created_at).getTime()

	if (age > RECENT_SIGN_IN_SECONDS * 1000) {
		throw new AuthError('sign_in_again', 'Sign in again to change your passkeys')
	}
}
