import { formVariants } from '@/form/variants'

describe('formVariants', () => {
	describe('defaults', () => {
		it('returns default spacing classes', () => {
			const classes = formVariants()

			expect(classes).toContain('gap-4')
		})
	})

	describe('spacing variants', () => {
		it('applies compact spacing', () => {
			const classes = formVariants({ spacing: 'compact' })

			expect(classes).toContain('gap-3')
		})

		it('applies default spacing', () => {
			const classes = formVariants({ spacing: 'default' })

			expect(classes).toContain('gap-4')
		})

		it('applies relaxed spacing', () => {
			const classes = formVariants({ spacing: 'relaxed' })

			expect(classes).toContain('gap-6')
		})
	})

	describe('base classes', () => {
		it('includes form base styles', () => {
			const classes = formVariants()

			expect(classes).toContain('flex')
			expect(classes).toContain('flex-col')
			expect(classes).toContain('w-full')
		})
	})
})
