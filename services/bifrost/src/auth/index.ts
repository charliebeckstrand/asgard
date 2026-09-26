export type { Config } from './config.js'
export { configure, getConfig } from './config.js'
export { AuthError, authenticateUser, registerUser } from './credentials.js'
export {
	createSession,
	deleteExpiredSessions,
	deleteSession,
	deleteUserSessions,
	findSession,
	hashToken,
	MAX_SESSIONS_PER_USER,
	SESSION_TTL_SECONDS,
} from './sessions.js'
export type { CredentialsRow, SessionRepository, UserRepository } from './types.js'
