import { createTokenBucket } from '@/rate-limit'

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

	it('uses default rate and burst when no config', () => {
		const bucket = createTokenBucket()

		for (let i = 0; i < 10; i++) {
			expect(bucket.consume('key1')).toBe(true)
		}

		expect(bucket.consume('key1')).toBe(false)
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
