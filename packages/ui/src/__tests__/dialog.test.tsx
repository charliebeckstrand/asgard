import { dialogVariants, overlayVariants } from '@/dialog/variants'

describe('dialogVariants', () => {
	it('returns a string', () => {
		const classes = dialogVariants()

		expect(typeof classes).toBe('string')
		expect(classes.length).toBeGreaterThan(0)
	})

	it('accepts size variants', () => {
		expect(typeof dialogVariants({ size: 'small' })).toBe('string')
		expect(typeof dialogVariants({ size: 'medium' })).toBe('string')
		expect(typeof dialogVariants({ size: 'large' })).toBe('string')
	})
})

describe('overlayVariants', () => {
	it('returns a string', () => {
		const classes = overlayVariants()

		expect(typeof classes).toBe('string')
		expect(classes.length).toBeGreaterThan(0)
	})
})
