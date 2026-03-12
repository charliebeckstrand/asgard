import { cardVariants } from '@/card/variants'

describe('cardVariants', () => {
	it('returns a string', () => {
		const classes = cardVariants()

		expect(typeof classes).toBe('string')
		expect(classes.length).toBeGreaterThan(0)
	})

	it('accepts padding variants', () => {
		expect(typeof cardVariants({ padding: 'none' })).toBe('string')
		expect(typeof cardVariants({ padding: 'small' })).toBe('string')
		expect(typeof cardVariants({ padding: 'medium' })).toBe('string')
		expect(typeof cardVariants({ padding: 'large' })).toBe('string')
	})

	it('accepts shadow variants', () => {
		expect(typeof cardVariants({ shadow: 'none' })).toBe('string')
		expect(typeof cardVariants({ shadow: 'small' })).toBe('string')
		expect(typeof cardVariants({ shadow: 'medium' })).toBe('string')
	})
})
