import { safeEqual } from '../../auth/safe-equal.js'

describe('safeEqual', () => {
	it('matches equal strings', () => {
		expect(safeEqual('secret-token', 'secret-token')).toBe(true)
	})

	it('refuses strings of the same length that differ', () => {
		expect(safeEqual('secret-token', 'wrong!-token')).toBe(false)
	})

	it('refuses strings of different lengths', () => {
		expect(safeEqual('short', 'much-longer-string')).toBe(false)
	})
})
