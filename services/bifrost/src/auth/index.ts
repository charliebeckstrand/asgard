export type { Config } from './config.js'
export { configure, getConfig } from './config.js'
export { AuthError, authenticateUser, registerUser } from './credentials.js'
export {
	authenticatePasskey,
	CHALLENGE_TTL_SECONDS,
	createRegistrationOptions,
	createSignInOptions,
	deleteExpiredChallenges,
	deletePasskey,
	getPasskeys,
	registerPasskey,
} from './passkeys.js'
export {
	createSession,
	deleteExpiredSessions,
	deleteSession,
	deleteUserSessions,
	findSession,
	hashToken,
	MAX_SESSIONS_PER_USER,
	RECENT_SIGN_IN_SECONDS,
	requireRecentSignIn,
	SESSION_TTL_SECONDS,
} from './sessions.js'
export type {
	CredentialsRow,
	PasskeyRepository,
	SessionRepository,
	StoredPasskey,
	UserRepository,
} from './types.js'
