import { inputVariants } from '@/input/variants'

describe('inputVariants', () => {
	it('returns a string', () => {
		const classes = inputVariants()

		expect(typeof classes).toBe('string')
		expect(classes.length).toBeGreaterThan(0)
	})

	it('accepts type variants', () => {
		expect(typeof inputVariants({ type: 'default' })).toBe('string')
		expect(typeof inputVariants({ type: 'error' })).toBe('string')
		expect(typeof inputVariants({ type: 'success' })).toBe('string')
	})

	it('accepts size variants', () => {
		expect(typeof inputVariants({ size: 'small' })).toBe('string')
		expect(typeof inputVariants({ size: 'medium' })).toBe('string')
		expect(typeof inputVariants({ size: 'large' })).toBe('string')
	})
})
