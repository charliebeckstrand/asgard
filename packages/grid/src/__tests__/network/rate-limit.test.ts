import { Hono } from 'hono'
import { clientIp } from '../../network/ip.js'
import { createTokenBucket, rateLimit } from '../../network/rate-limit.js'

describe('createTokenBucket', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('allows consume up to burst capacity', () => {
		const bucket = createTokenBucket({ rate: 5, burst: 3 })

		expect(bucket.consume('key1')).toBe(true)
		expect(bucket.consume('key1')).toBe(true)
		expect(bucket.consume('key1')).toBe(true)
	})

	it('returns false when tokens exhausted', () => {
		const bucket = createTokenBucket({ rate: 5, burst: 2 })

		bucket.consume('key1')
		bucket.consume('key1')

		expect(bucket.consume('key1')).toBe(false)
	})

	it('refills tokens over time', () => {
		const bucket = createTokenBucket({ rate: 10, burst: 2 })

		bucket.consume('key1')
		bucket.consume('key1')

		expect(bucket.consume('key1')).toBe(false)

		vi.advanceTimersByTime(200)

		expect(bucket.consume('key1')).toBe(true)
	})

	it('tokens cap at burst limit', () => {
		const bucket = createTokenBucket({ rate: 100, burst: 3 })

		bucket.consume('key1')

		vi.advanceTimersByTime(10_000)

		expect(bucket.consume('key1')).toBe(true)
		expect(bucket.consume('key1')).toBe(true)
		expect(bucket.consume('key1')).toBe(true)
		expect(bucket.consume('key1')).toBe(false)
	})

	it('different keys are independent', () => {
		const bucket = createTokenBucket({ rate: 5, burst: 1 })

		bucket.consume('key-a')

		expect(bucket.consume('key-a')).toBe(false)
		expect(bucket.consume('key-b')).toBe(true)
	})

	it('evicts stale entries after sweep interval', () => {
		const bucket = createTokenBucket({ rate: 5, burst: 10 })

		bucket.consume('stale-key')

		vi.advanceTimersByTime(3_600_001 + 300_001)

		bucket.consume('trigger-sweep')

		// stale-key was evicted, gets fresh bucket
		for (let i = 0; i < 10; i++) {
			expect(bucket.consume('stale-key')).toBe(true)
		}
	})
})

describe('rateLimit', () => {
	function buildApp(onLimited?: (ip: string) => void) {
		const app = new Hono()

		app.use('*', clientIp({ header: 'do-connecting-ip' }))

		app.use('*', rateLimit({ rate: 0, burst: 1, onLimited }))

		app.get('/x', (c) => c.text('OK'))

		return app
	}

	const from = (ip: string) => ({ headers: { 'do-connecting-ip': ip } })

	it('answers 429 once the address has used its burst', async () => {
		const app = buildApp()

		expect((await app.request('/x', from('203.0.113.7'))).status).toBe(200)

		expect((await app.request('/x', from('203.0.113.7'))).status).toBe(429)
	})

	it('keeps a separate budget per address', async () => {
		const app = buildApp()

		await app.request('/x', from('203.0.113.7'))

		expect((await app.request('/x', from('203.0.113.8'))).status).toBe(200)
	})

	it('calls onLimited with the address it turned away', async () => {
		const onLimited = vi.fn()

		const app = buildApp(onLimited)

		await app.request('/x', from('203.0.113.7'))

		expect(onLimited).not.toHaveBeenCalled()

		await app.request('/x', from('203.0.113.7'))

		expect(onLimited).toHaveBeenCalledWith('203.0.113.7')
	})
})
