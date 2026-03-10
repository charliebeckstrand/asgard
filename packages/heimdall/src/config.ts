import type { UserRepository } from './types.js'

export interface HeimdallConfig {
	userRepository: UserRepository
	secretKey: string
	apiKey?: string
	onSecurityEvent?: (eventType: string, ip: string, details?: Record<string, unknown>) => void
}

let _config: HeimdallConfig | null = null

export function configure(
	config: Partial<HeimdallConfig> & Pick<HeimdallConfig, 'userRepository' | 'secretKey'>,
): void {
	if (config.secretKey.length < 32) {
		throw new Error('Heimdall secretKey must be at least 32 characters')
	}

	_config = { ...config }
}

export function getConfig(): HeimdallConfig {
	if (!_config) throw new Error('Heimdall not configured. Call configure() first.')

	return _config
}
