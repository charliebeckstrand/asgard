export type { Config, OAuthClient } from './config.js'
export { configure, getConfig } from './config.js'
export {
	AuthError,
	authenticateUser,
	deleteStaleFailedLogins,
	registerUser,
} from './credentials.js'
export {
	confirmTotp,
	deleteTotp,
	generateRecoveryCodes,
	getFactors,
	MAX_FAILED_STEPS,
	RECOVERY_CODE_COUNT,
	type SecondFactorMethod,
	type SecondFactorProof,
	secondFactorMethods,
	startTotpSetup,
	verifySession,
} from './mfa.js'
export {
	completeOAuth,
	deleteExpiredOAuthStates,
	enabledProviders,
	getIdentities,
	OAUTH_PROVIDERS,
	OAUTH_STATE_TTL_SECONDS,
	OAuthFailure,
	type OAuthFailureCode,
	type OAuthOutcome,
	safeReturnTo,
	startOAuth,
	unlinkIdentity,
} from './oauth.js'
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
	passSecondStep,
	RECENT_SIGN_IN_SECONDS,
	requireRecentSignIn,
	SESSION_TTL_SECONDS,
} from './sessions.js'
export type {
	CredentialsRow,
	Factors,
	LinkedIdentity,
	MfaRepository,
	OAuthIdentity,
	OAuthProvider,
	OAuthRepository,
	PasskeyRepository,
	SessionRepository,
	StoredOAuthState,
	StoredPasskey,
	StoredTotp,
	UserRepository,
} from './types.js'
