import type { Passkey, Session, User, UserRole } from 'skuld'

export interface CredentialsRow {
	id: string
	hashed_password: string
	is_active: boolean
	role: UserRole
}

export interface UserRepository {
	insertUser(email: string, hashedPassword: string): Promise<User>
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

/** A passkey with what a ceremony needs: its public key, signature counter and transports. */
export interface StoredPasskey {
	id: string
	user_id: string
	public_key: Uint8Array<ArrayBuffer>
	counter: number
	transports: string[]
	created_at: string
}

export interface PasskeyRepository {
	insertPasskey(
		userId: string,
		credential: { id: string; publicKey: Uint8Array; counter: number; transports: string[] },
	): Promise<Passkey>
	findPasskey(id: string): Promise<StoredPasskey | null>
	getPasskeys(userId: string): Promise<StoredPasskey[]>
	setCounter(id: string, counter: number): Promise<void>
	/** Refuses to delete the last second factor of an admin. */
	deletePasskey(id: string, userId: string): Promise<'deleted' | 'not_found' | 'last_admin_factor'>
	/** `userId` binds the challenge to adding a passkey; null means signing in. */
	createChallenge(id: string, userId: string | null, expiresAt: Date): Promise<void>
	/** Deletes the live challenge for `userId` and reports whether there was one. */
	useChallenge(id: string, userId: string | null): Promise<boolean>
	deleteExpiredChallenges(): Promise<number>
}

/** The second factors of a user. Recovery codes only count while another factor is on. */
export interface Factors {
	passkeys: number
	totp: boolean
	recovery_codes: number
}

export interface StoredTotp {
	secret: Uint8Array
	last_step: number
	confirmed: boolean
}

export interface MfaRepository {
	getFactors(userId: string): Promise<Factors>
	getTotp(userId: string): Promise<StoredTotp | null>
	/** Stores an unconfirmed secret, replacing an earlier unconfirmed one. Refuses when one is confirmed. */
	setPendingTotp(userId: string, secret: Uint8Array): Promise<'created' | 'exists'>
	/** Confirms the pending secret and records `step` as used. */
	confirmTotp(userId: string, step: number): Promise<boolean>
	/** Records `step` as used, unless it or a later one already was. */
	useTotpStep(userId: string, step: number): Promise<boolean>
	/** Refuses to delete the last second factor of an admin. */
	deleteTotp(userId: string): Promise<'deleted' | 'not_found' | 'last_admin_factor'>
	replaceRecoveryCodes(userId: string, hashes: string[]): Promise<void>
	useRecoveryCode(userId: string, hash: string): Promise<boolean>
	createTicket(id: string, userId: string, expiresAt: Date): Promise<void>
	/** Spends one attempt of a live ticket and returns its user, or null when none is left. */
	useTicketAttempt(id: string, maxAttempts: number): Promise<string | null>
	/** The user of a live ticket with attempts left, without spending one. */
	findTicket(id: string, maxAttempts: number): Promise<string | null>
	deleteTicket(id: string): Promise<void>
	deleteExpiredTickets(): Promise<number>
}
