import type { SessionRepository, UserRepository } from './types.js'

export type AuthSecurityEventType = 'login_failed' | 'registration'

export interface AuthSecurityEvent {
	type: AuthSecurityEventType
	ip: string
	details?: Record<string, unknown>
}

export interface Config {
	userRepository: UserRepository
	sessionRepository: SessionRepository
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
