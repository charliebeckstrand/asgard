import { hash, randomBytes } from 'node:crypto'
import { sessionRepository } from '../lib/repositories.js'
import type { Session } from '../lib/schemas.js'

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

export const MAX_SESSIONS_PER_USER = 10

/**
 * Sessions are opaque: the cookie holds 32 random bytes and the database holds
 * only their SHA-256, so a leaked table can't be replayed.
 */
export function hashToken(token: string): string {
	return hash('sha256', token)
}

/** 32 random bytes, as a token for a cookie or a link. */
export function randomToken(): string {
	return randomBytes(32).toString('base64url')
}

/** The time `seconds` from now. */
export function expiresIn(seconds: number): Date {
	return new Date(Date.now() + seconds * 1000)
}

/**
 * Starts a session for `userId`. When the browser still presents a session
 * (`replacing`), that one is deleted, so signing in again never leaves a stray
 * row behind. `twoStep` marks a sign-in that already passed a second step, such
 * as a passkey.
 */
export async function createSession(
	userId: string,
	{ replacing, twoStep = false }: { replacing?: string; twoStep?: boolean } = {},
): Promise<{ token: string; session: Session }> {
	const token = randomToken()

	const session = await sessionRepository.createSession(
		hashToken(token),
		userId,
		expiresIn(SESSION_TTL_SECONDS),
		{
			replacing: replacing ? hashToken(replacing) : undefined,
			limit: MAX_SESSIONS_PER_USER,
			twoStep,
		},
	)

	return { token, session }
}

export function findSession(token: string): Promise<Session | null> {
	return sessionRepository.findSession(hashToken(token))
}

export function deleteExpiredSessions(): Promise<number> {
	return sessionRepository.deleteExpiredSessions()
}
