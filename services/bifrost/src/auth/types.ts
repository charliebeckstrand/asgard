import type { User, UserRole } from 'skuld'

export interface CredentialsRow {
	id: string
	hashed_password: string
	is_active: boolean
}

export interface UserRepository {
	insertUser(id: string, email: string, hashedPassword: string): Promise<User>
	getCredentialsByEmail(email: string): Promise<CredentialsRow | null>
	getUsers(): Promise<User[]>
	getUserById(id: string): Promise<User | null>
	updateUser(
		id: string,
		data: { email?: string; is_active?: boolean; role?: UserRole },
	): Promise<User | null>
	deleteUser(id: string): Promise<boolean>
}

export interface SessionRow {
	id: string
	user_id: string
	refresh_jti: string
	previous_jti: string | null
	rotated_at: Date | null
	expires_at: Date
	revoked_at: Date | null
}

/** The user behind a live session: not revoked, not expired, account active. */
export interface SessionUser {
	id: string
	role: UserRole
}

export interface SessionRepository {
	createSession(id: string, userId: string, refreshJti: string, expiresAt: Date): Promise<void>
	getSession(id: string): Promise<SessionRow | null>
	getSessionUser(id: string): Promise<SessionUser | null>
	/** Swaps `currentJti` for `nextJti`; false when the session isn't live or `currentJti` is stale. */
	rotateSession(id: string, currentJti: string, nextJti: string, expiresAt: Date): Promise<boolean>
	revokeSession(id: string): Promise<void>
	revokeUserSessions(userId: string): Promise<void>
}
