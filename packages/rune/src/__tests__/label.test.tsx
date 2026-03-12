import { labelVariants } from '@/label/variants'

describe('labelVariants', () => {
	describe('defaults', () => {
		it('returns default size classes', () => {
			const classes = labelVariants()

			expect(classes).toContain('text-sm')
		})
	})

	describe('size variants', () => {
		it('applies small size', () => {
			const classes = labelVariants({ size: 'small' })

			expect(classes).toContain('text-xs')
		})

		it('applies medium size', () => {
			const classes = labelVariants({ size: 'medium' })

			expect(classes).toContain('text-sm')
		})
	})

	describe('base classes', () => {
		it('includes label base styles', () => {
			const classes = labelVariants()

			expect(classes).toContain('font-medium')
			expect(classes).toContain('text-gray-700')
		})
	})
})
