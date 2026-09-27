import type {
	Email,
	EmailTokenRepository,
	MfaRepository,
	OAuthProvider,
	OAuthRepository,
	PasskeyRepository,
	SessionRepository,
	UserRepository,
} from './types.js'

export type AuthSecurityEventType = 'login_failed' | 'registration'

export interface AuthSecurityEvent {
	type: AuthSecurityEventType
	ip: string
	details?: Record<string, unknown>
}

export interface Config {
	userRepository: UserRepository
	sessionRepository: SessionRepository
	passkeyRepository: PasskeyRepository
	mfaRepository: MfaRepository
	oauthRepository: OAuthRepository
	emailTokenRepository: EmailTokenRepository
	/** Sends an email, such as a link to verify the address or reset the password. */
	sendEmail: (email: Email) => Promise<void>
	/** Whether a new password is known from a data breach. Unset checks nothing. */
	isBreachedPassword?: (password: string) => Promise<boolean>
	/** The domain passkeys belong to, and the origins allowed to use them. */
	passkeys: { domain: string; origins: string[] }
	/**
	 * `key` encrypts authenticator-app secrets; unset turns authenticator apps off.
	 * `issuer` names the account in the app.
	 */
	mfa: { key?: string; issuer: string }
	/** The OAuth clients of GitHub and Google. A provider without one is off. */
	oauth: Partial<Record<OAuthProvider, OAuthClient>>
	onSecurityEvent?: (event: AuthSecurityEvent) => void
}

export interface OAuthClient {
	clientId: string
	clientSecret: string
}

let _config: Config | null = null

export function configure(config: Config): void {
	_config = { ...config }
}

export function getConfig(): Config {
	if (!_config) throw new Error('Auth not configured. Call configure() first.')

	return _config
}
