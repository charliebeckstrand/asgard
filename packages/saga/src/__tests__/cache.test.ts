import type { RedisClientType } from 'redis'
import type { Mock } from 'vitest'
import { type Cache, createCacheClient, LockHeldError } from '../cache/cache.js'
import { RELEASE_LOCK_SCRIPT, TAKE_TOKEN_SCRIPT } from '../cache/scripts.js'

interface MockRedis {
	store: Map<string, string>
	ping: Mock
	get: Mock
	set: Mock
	del: Mock
	eval: Mock
}

function createMockRedis(): { client: RedisClientType; mock: MockRedis } {
	const store = new Map<string, string>()

	const mock: MockRedis = {
		store,

		ping: vi.fn().mockResolvedValue('PONG'),

		get: vi.fn(async (key: string) => store.get(key) ?? null),

		set: vi.fn(async (key: string, value: string, opts?: { EX?: number; NX?: boolean }) => {
			if (opts?.NX && store.has(key)) return null

			store.set(key, value)

			return 'OK'
		}),

		del: vi.fn(async (keys: string | string[]) => {
			const arr = Array.isArray(keys) ? keys : [keys]

			let count = 0

			for (const k of arr) if (store.delete(k)) count++

			return count
		}),

		eval: vi.fn(),
	}

	return { client: mock as unknown as RedisClientType, mock }
}

describe('createCacheClient', () => {
	let cache: Cache
	let redis: MockRedis

	beforeEach(() => {
		const made = createMockRedis()
		cache = createCacheClient(made.client)
		redis = made.mock
	})

	describe('ping', () => {
		it('returns true when Redis answers PONG', async () => {
			expect(await cache.ping()).toBe(true)
		})

		it('returns false when the client throws', async () => {
			redis.ping.mockRejectedValueOnce(new Error('connection refused'))

			expect(await cache.ping()).toBe(false)
		})

		it('returns false when the response is not PONG', async () => {
			redis.ping.mockResolvedValueOnce('NOPE')

			expect(await cache.ping()).toBe(false)
		})
	})

	describe('get / set / del', () => {
		it('round-trips a JSON value', async () => {
			await cache.set('user:1', { id: 1, name: 'Alice' })

			expect(await cache.get('user:1')).toEqual({ id: 1, name: 'Alice' })
		})

		it('returns null for a missing key', async () => {
			expect(await cache.get('missing')).toBeNull()
		})

		it('passes EX when ttlSeconds is provided', async () => {
			await cache.set('k', 'v', 60)

			expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify('v'), { EX: 60 })
		})

		it('omits options when ttlSeconds is undefined', async () => {
			await cache.set('k', 'v')

			expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify('v'))
		})

		it('del returns 0 for an empty key list without calling Redis', async () => {
			expect(await cache.del()).toBe(0)
			expect(redis.del).not.toHaveBeenCalled()
		})

		it('del forwards a key array to Redis', async () => {
			await cache.set('a', 1)
			await cache.set('b', 2)

			expect(await cache.del('a', 'b', 'missing')).toBe(2)
			expect(redis.del).toHaveBeenCalledWith(['a', 'b', 'missing'])
		})
	})

	describe('remember', () => {
		it('returns the cached value without calling fn', async () => {
			await cache.set('k', 'cached')

			const fn = vi.fn()

			expect(await cache.remember('k', 60, fn)).toBe('cached')
			expect(fn).not.toHaveBeenCalled()
		})

		it('computes, stores, and returns when not cached', async () => {
			const fn = vi.fn().mockResolvedValue({ result: 42 })

			expect(await cache.remember('k', 60, fn)).toEqual({ result: 42 })

			expect(fn).toHaveBeenCalledOnce()
			expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify({ result: 42 }), { EX: 60 })
		})

		it('does not cache when fn throws', async () => {
			const fn = vi.fn().mockRejectedValue(new Error('boom'))

			await expect(cache.remember('k', 60, fn)).rejects.toThrow('boom')

			expect(redis.set).not.toHaveBeenCalled()
		})
	})

	describe('withLock', () => {
		it('runs fn while holding the lock and releases on success', async () => {
			redis.eval.mockResolvedValue(1)

			const fn = vi.fn().mockResolvedValue('done')

			expect(await cache.withLock('lock', 30, fn)).toBe('done')

			expect(redis.set).toHaveBeenCalledWith('lock', expect.any(String), { NX: true, EX: 30 })
			expect(redis.eval).toHaveBeenCalledWith(RELEASE_LOCK_SCRIPT, expect.any(Object))
		})

		it('throws LockHeldError when NX rejects acquisition', async () => {
			redis.set.mockResolvedValueOnce(null)

			const fn = vi.fn()

			await expect(cache.withLock('lock', 30, fn)).rejects.toBeInstanceOf(LockHeldError)
			expect(fn).not.toHaveBeenCalled()
		})

		it('releases the lock even when fn throws', async () => {
			redis.eval.mockResolvedValue(1)

			await expect(
				cache.withLock('lock', 30, async () => {
					throw new Error('boom')
				}),
			).rejects.toThrow('boom')

			expect(redis.eval).toHaveBeenCalledWith(RELEASE_LOCK_SCRIPT, expect.any(Object))
		})

		it('uses a unique token per acquisition', async () => {
			// Simulate the release script clearing the key so the second NX succeeds.
			redis.eval.mockImplementation(
				async (_script: string, opts: { keys: string[]; arguments: string[] }) => {
					const [key] = opts.keys
					const [token] = opts.arguments

					if (redis.store.get(key) === JSON.stringify(token) || redis.store.get(key) === token) {
						redis.store.delete(key)

						return 1
					}

					return 0
				},
			)

			await cache.withLock('lock', 30, async () => undefined)
			await cache.withLock('lock', 30, async () => undefined)

			const tokenA = (redis.set.mock.calls[0] as [string, string, unknown])[1]
			const tokenB = (redis.set.mock.calls[1] as [string, string, unknown])[1]

			expect(tokenA).not.toBe(tokenB)
		})
	})

	describe('takeToken', () => {
		it('parses [allowed, remaining, retryAfterMs] from EVAL', async () => {
			redis.eval.mockResolvedValueOnce([1, 4, 0])

			expect(await cache.takeToken('rl:user:1', 5, 1)).toEqual({
				allowed: true,
				remaining: 4,
				retryAfterMs: 0,
			})
		})

		it('reports denial with retry-after when the bucket is empty', async () => {
			redis.eval.mockResolvedValueOnce([0, 0, 250])

			expect(await cache.takeToken('rl:user:1', 5, 4)).toEqual({
				allowed: false,
				remaining: 0,
				retryAfterMs: 250,
			})
		})

		it('forwards capacity, refill rate, and now to the script', async () => {
			redis.eval.mockResolvedValueOnce([1, 9, 0])

			await cache.takeToken('rl:user:1', 10, 2)

			const call = redis.eval.mock.calls[0] as [string, { keys: string[]; arguments: string[] }]

			expect(call[0]).toBe(TAKE_TOKEN_SCRIPT)
			expect(call[1].keys).toEqual(['rl:user:1'])
			expect(call[1].arguments[0]).toBe('10')
			expect(call[1].arguments[1]).toBe('2')
			expect(Number(call[1].arguments[2])).toBeGreaterThan(0)
		})
	})
})
