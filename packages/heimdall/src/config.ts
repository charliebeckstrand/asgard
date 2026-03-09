import type { Pool } from 'pg'

export interface HeimdallConfig {
	getPool: () => Pool
	secretKey: string
	accessTokenExpireMinutes: number
	refreshTokenExpireDays: number
	vidarUrl?: string
	vidarApiKey?: string
	apiKey?: string
}

let _config: HeimdallConfig | null = null

export function configure(
	config: Partial<HeimdallConfig> & Pick<HeimdallConfig, 'getPool' | 'secretKey'>,
): void {
	_config = {
		accessTokenExpireMinutes: 30,
		refreshTokenExpireDays: 7,
		...config,
	}
}

export function getConfig(): HeimdallConfig {
	if (!_config) throw new Error('Heimdall not configured. Call configure() first.')
	return _config
}
