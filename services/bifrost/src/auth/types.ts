import type { Session, User } from 'skuld'

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
	/** Only applies to `role = 'user'`; returns null for admins and unknown ids. */
	setUserActive(id: string, isActive: boolean): Promise<User | null>
}

export interface SessionRepository {
	/**
	 * Inserts the session, deletes `replacing` (the browser's previous session) and
	 * keeps at most `limit` live sessions for the user, evicting the oldest.
	 */
	createSession(
		id: string,
		userId: string,
		expiresAt: Date,
		options: { replacing?: string; limit: number },
	): Promise<Session>
	/** A live session: not expired, and its user is active. */
	findSession(id: string): Promise<Session | null>
	deleteSession(id: string): Promise<void>
	deleteUserSessions(userId: string, options?: { except?: string }): Promise<void>
	deleteExpiredSessions(): Promise<number>
}
