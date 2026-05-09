import { createClient, type RedisClientType } from 'redis'
import { type Cache, createCacheClient } from './cache.js'

export {
	type Cache,
	createCacheClient,
	LockHeldError,
	type TokenResult,
} from './cache.js'

export interface CacheOptions {
	socket?: { connectTimeout?: number }
}

interface State {
	client: RedisClientType
	cache: Cache
	connected: Promise<void>
}

/**
 * Lazy Redis client. Connects on first use, retries silently in the
 * background, and exposes a `Cache` proxy whose methods await the
 * underlying connection. Mirrors `createDatabase` for symmetry.
 */
export function createCache(
	getRedisUrl: () => string,
	options: CacheOptions = {},
): { cache: Cache; closeCache: () => Promise<void> } {
	let state: State | null = null

	const init = (): State => {
		if (state) return state

		const client = createClient({ url: getRedisUrl(), ...options }) as RedisClientType

		// Idle disconnects shouldn't crash the process; surface failures via ping().
		client.on('error', (err: Error) => {
			console.error('[saga] redis client error:', err.message)
		})

		const connected = client.connect().then(() => {})

		state = { client, cache: createCacheClient(client), connected }

		return state
	}

	const cache = new Proxy({} as Cache, {
		get(_, prop) {
			return async (...args: unknown[]) => {
				const s = init()

				await s.connected

				const method = s.cache[prop as keyof Cache] as (...a: unknown[]) => unknown

				return method.call(s.cache, ...args)
			}
		},
	})

	return {
		cache,

		async closeCache() {
			if (!state) return

			await state.connected.catch(() => {})
			await state.client.quit().catch(() => {})

			state = null
		},
	}
}
