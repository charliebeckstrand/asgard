import type { JwtKeys } from 'grid/auth'
import type { UserRepository } from './types.js'

type Event = {
	type: string
	ip: string
	details?: Record<string, unknown>
}

export interface Config {
	userRepository: UserRepository
	keys: JwtKeys
	onSecurityEvent?: (event: Event) => void
}

let _config: Config | null = null

export function configure(config: Partial<Config> & Pick<Config, 'userRepository' | 'keys'>): void {
	if (config.keys.current.length < 32) {
		throw new Error('Heimdall keys.current must be at least 32 characters')
	}

	if (config.keys.previous !== undefined && config.keys.previous.length < 32) {
		throw new Error('Heimdall keys.previous must be at least 32 characters when set')
	}

	_config = { ...config }
}

export function getConfig(): Config {
	if (!_config) throw new Error('Heimdall not configured. Call configure() first.')

	return _config
}
