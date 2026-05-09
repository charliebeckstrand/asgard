import type { UserRepository } from './types.js'

type Event = {
	type: string
	ip: string
	details?: Record<string, unknown>
}

export interface Config {
	userRepository: UserRepository
	secretKey: string
	onSecurityEvent?: (event: Event) => void
}

let _config: Config | null = null

export function configure(
	config: Partial<Config> & Pick<Config, 'userRepository' | 'secretKey'>,
): void {
	if (config.secretKey.length < 32) {
		throw new Error('Heimdall secretKey must be at least 32 characters')
	}

	_config = { ...config }
}

export function getConfig(): Config {
	if (!_config) throw new Error('Heimdall not configured. Call configure() first.')

	return _config
}
