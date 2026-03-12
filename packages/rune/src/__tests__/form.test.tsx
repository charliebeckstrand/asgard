import { formVariants } from '@/form/variants'

describe('formVariants', () => {
	it('returns a string', () => {
		const classes = formVariants()

		expect(typeof classes).toBe('string')
		expect(classes.length).toBeGreaterThan(0)
	})

	it('accepts spacing variants', () => {
		expect(typeof formVariants({ spacing: 'compact' })).toBe('string')
		expect(typeof formVariants({ spacing: 'default' })).toBe('string')
		expect(typeof formVariants({ spacing: 'relaxed' })).toBe('string')
	})
})
