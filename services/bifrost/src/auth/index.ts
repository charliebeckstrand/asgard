export type { Config } from './config.js'
export { configure, getConfig } from './config.js'
export { AuthError, authenticateUser, registerUser } from './credentials.js'
export {
	completeLoginTicket,
	confirmTotp,
	createLoginTicket,
	deleteExpiredTickets,
	deleteTotp,
	findLoginTicket,
	generateRecoveryCodes,
	getFactors,
	MAX_TICKET_ATTEMPTS,
	RECOVERY_CODE_COUNT,
	type SecondFactorMethod,
	type SecondFactorProof,
	secondFactorMethods,
	startTotpSetup,
	TICKET_TTL_SECONDS,
} from './mfa.js'
export {
	authenticatePasskey,
	CHALLENGE_TTL_SECONDS,
	createRegistrationOptions,
	createSecondFactorOptions,
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
	Factors,
	MfaRepository,
	PasskeyRepository,
	SessionRepository,
	StoredPasskey,
	StoredTotp,
	UserRepository,
} from './types.js'
