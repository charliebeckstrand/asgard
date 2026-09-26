import type {
	MfaRepository,
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
	/** The domain passkeys belong to, and the origins allowed to use them. */
	passkeys: { domain: string; origins: string[] }
	/**
	 * `key` encrypts authenticator-app secrets; unset turns authenticator apps off.
	 * `issuer` names the account in the app.
	 */
	mfa: { key?: string; issuer: string }
	onSecurityEvent?: (event: AuthSecurityEvent) => void
}

let _config: Config | null = null

export function configure(config: Config): void {
	_config = { ...config }
}

export function getConfig(): Config {
	if (!_config) throw new Error('Auth not configured. Call configure() first.')

	return _config
}
