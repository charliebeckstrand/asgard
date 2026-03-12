import { buttonVariants } from '@/button/variants'

describe('buttonVariants', () => {
	it('returns a string', () => {
		const classes = buttonVariants()

		expect(typeof classes).toBe('string')
		expect(classes.length).toBeGreaterThan(0)
	})

	it('accepts type variants', () => {
		expect(typeof buttonVariants({ type: 'default' })).toBe('string')
		expect(typeof buttonVariants({ type: 'secondary' })).toBe('string')
		expect(typeof buttonVariants({ type: 'tertiary' })).toBe('string')
		expect(typeof buttonVariants({ type: 'warning' })).toBe('string')
		expect(typeof buttonVariants({ type: 'error' })).toBe('string')
	})

	it('accepts size variants', () => {
		expect(typeof buttonVariants({ size: 'tiny' })).toBe('string')
		expect(typeof buttonVariants({ size: 'small' })).toBe('string')
		expect(typeof buttonVariants({ size: 'medium' })).toBe('string')
		expect(typeof buttonVariants({ size: 'large' })).toBe('string')
	})
})
