import { createLogger, type Logger } from 'saga/log'
import { environment } from './env.js'

let cached: Logger | null = null

export function logger(): Logger {
	if (cached) return cached

	const env = environment()

	cached = createLogger({
		service: 'vidar',
		level: env.NODE_ENV === 'test' ? 'silent' : 'info',
		pretty: env.NODE_ENV === 'development',
	})

	return cached
}
