export { deleteOldActivity, getActivity, recordActivity } from './activity.js'
export type { OAuthClient } from './config.js'
export { configure, getConfig } from './config.js'
export {
	AuthError,
	authenticateUser,
	checkTurnstile,
	deleteOldSignUps,
	deleteStaleFailedLogins,
	registerUser,
	turnstileSiteKey,
} from './credentials.js'
export {
	deleteExpiredEmailTokens,
	deleteOldSentEmails,
	requestPasswordReset,
	resetPassword,
	sendAccountDeletedEmail,
	sendAccountExistsEmail,
	sendSecurityNotice,
	sendVerificationEmail,
	verifyEmail,
} from './email.js'
export {
	checkMfaKey,
	confirmTotp,
	deleteStaleFailedSteps,
	deleteTotp,
	generateRecoveryCodes,
	getFactors,
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
	OAuthFailure,
	safeReturnTo,
	startOAuth,
	unlinkIdentity,
} from './oauth.js'
export {
	authenticatePasskey,
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
	passSecondStep,
	SESSION_TTL_SECONDS,
} from './sessions.js'
export type { Email, OAuthProvider } from './types.js'
