export type { OAuthProvider } from '../lib/oauth-repository.js'
export { deleteOldActivity, getActivity, recordActivity } from './activity.js'
export {
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
export { AuthError } from './errors.js'
export {
	checkMfaKey,
	confirmTotp,
	deleteStaleFailedSteps,
	deleteTotp,
	generateRecoveryCodes,
	type SecondFactorProof,
	secondFactorMethods,
	startTotpSetup,
	verifySession,
} from './mfa.js'
export {
	completeOAuth,
	deleteExpiredOAuthStates,
	enabledProviders,
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
	findSession,
	SESSION_TTL_SECONDS,
} from './sessions.js'
