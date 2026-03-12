import { labelVariants } from '@/label/variants'

describe('labelVariants', () => {
	it('returns a string', () => {
		const classes = labelVariants()

		expect(typeof classes).toBe('string')
		expect(classes.length).toBeGreaterThan(0)
	})

	it('accepts size variants', () => {
		expect(typeof labelVariants({ size: 'small' })).toBe('string')
		expect(typeof labelVariants({ size: 'medium' })).toBe('string')
	})
})
