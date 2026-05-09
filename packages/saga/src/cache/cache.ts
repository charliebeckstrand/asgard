import { randomUUID } from 'node:crypto'
import type { RedisClientType } from 'redis'
import { RELEASE_LOCK_SCRIPT, TAKE_TOKEN_SCRIPT } from './scripts.js'

export class LockHeldError extends Error {
	constructor(key: string) {
		super(`Lock '${key}' is held`)

		this.name = 'LockHeldError'
	}
}

export interface TokenResult {
	allowed: boolean
	remaining: number
	retryAfterMs: number
}

export interface Cache {
	ping(): Promise<boolean>
	get<T>(key: string): Promise<T | null>
	set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
	del(...keys: string[]): Promise<number>
	remember<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>
	withLock<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>
	takeToken(key: string, capacity: number, refillPerSecond: number): Promise<TokenResult>
}

/**
 * Wraps a connected node-redis client in saga's Cache surface — JSON
 * serialization, cache-aside, distributed locks, and a token-bucket rate
 * limiter. Mirrors how `createDatabaseClient` wraps a pg Pool.
 */
export function createCacheClient(client: RedisClientType): Cache {
	return {
		async ping() {
			try {
				return (await client.ping()) === 'PONG'
			} catch {
				return false
			}
		},

		async get<T>(key: string) {
			const raw = await client.get(key)

			return raw === null ? null : (JSON.parse(raw) as T)
		},

		async set<T>(key: string, value: T, ttlSeconds?: number) {
			const serialized = JSON.stringify(value)

			if (ttlSeconds !== undefined) {
				await client.set(key, serialized, { EX: ttlSeconds })
			} else {
				await client.set(key, serialized)
			}
		},

		async del(...keys: string[]) {
			if (keys.length === 0) return 0

			return client.del(keys)
		},

		async remember<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
			const cached = await client.get(key)

			if (cached !== null) return JSON.parse(cached) as T

			const value = await fn()

			await client.set(key, JSON.stringify(value), { EX: ttlSeconds })

			return value
		},

		async withLock<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
			const token = randomUUID()

			const acquired = await client.set(key, token, { NX: true, EX: ttlSeconds })

			if (acquired === null) throw new LockHeldError(key)

			try {
				return await fn()
			} finally {
				await client.eval(RELEASE_LOCK_SCRIPT, { keys: [key], arguments: [token] })
			}
		},

		async takeToken(key: string, capacity: number, refillPerSecond: number) {
			const result = (await client.eval(TAKE_TOKEN_SCRIPT, {
				keys: [key],
				arguments: [String(capacity), String(refillPerSecond), String(Date.now())],
			})) as [number, number, number]

			return {
				allowed: result[0] === 1,
				remaining: result[1],
				retryAfterMs: result[2],
			}
		},
	}
}
