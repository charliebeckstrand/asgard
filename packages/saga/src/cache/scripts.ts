/**
 * Lua scripts evaluated server-side for atomicity. Redis runs each EVAL
 * call without yielding, so reads, mutations, and writes can't interleave
 * with another client.
 */

/**
 * Releases a lock only if the caller still holds it. Without the GET
 * compare-and-delete, a slow caller whose lease already expired could
 * delete a different caller's lock.
 *
 * KEYS[1] = lock key
 * ARGV[1] = caller's token
 *
 * Returns 1 if released, 0 if the lock was held by someone else (or gone).
 */
export const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
	return redis.call('DEL', KEYS[1])
else
	return 0
end
`.trim()

/**
 * Atomic token-bucket take. Refills lazily based on elapsed time so the
 * bucket needs no background worker — every read advances it.
 *
 * KEYS[1] = bucket key
 * ARGV[1] = capacity
 * ARGV[2] = refill rate (tokens per second)
 * ARGV[3] = now (ms since epoch, supplied by caller for testability)
 *
 * Returns [allowed (0|1), remaining (int), retry_after_ms (int)].
 */
export const TAKE_TOKEN_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'tokens', 'updated_ms')
local tokens = tonumber(data[1])
local updated_ms = tonumber(data[2])

if tokens == nil then
	tokens = capacity
	updated_ms = now_ms
end

local elapsed_ms = math.max(0, now_ms - updated_ms)
tokens = math.min(capacity, tokens + (elapsed_ms * refill / 1000))

local allowed = 0
local retry_after_ms = 0

if tokens >= 1 then
	allowed = 1
	tokens = tokens - 1
else
	retry_after_ms = math.ceil((1 - tokens) * 1000 / refill)
end

redis.call('HSET', key, 'tokens', tokens, 'updated_ms', now_ms)
redis.call('EXPIRE', key, math.ceil(capacity / refill) + 60)

return {allowed, math.floor(tokens), retry_after_ms}
`.trim()
