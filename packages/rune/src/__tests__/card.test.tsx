import { cardVariants } from '@/card/variants'

describe('cardVariants', () => {
	describe('defaults', () => {
		it('returns default padding and shadow classes', () => {
			const classes = cardVariants()

			expect(classes).toContain('p-6')
			expect(classes).toContain('shadow-sm')
		})
	})

	describe('padding variants', () => {
		it('applies none padding', () => {
			const classes = cardVariants({ padding: 'none' })

			expect(classes).not.toContain('p-4')
			expect(classes).not.toContain('p-6')
			expect(classes).not.toContain('p-8')
		})

		it('applies small padding', () => {
			const classes = cardVariants({ padding: 'small' })

			expect(classes).toContain('p-4')
		})

		it('applies medium padding', () => {
			const classes = cardVariants({ padding: 'medium' })

			expect(classes).toContain('p-6')
		})

		it('applies large padding', () => {
			const classes = cardVariants({ padding: 'large' })

			expect(classes).toContain('p-8')
		})
	})

	describe('shadow variants', () => {
		it('applies none shadow', () => {
			const classes = cardVariants({ shadow: 'none' })

			expect(classes).not.toContain('shadow-sm')
			expect(classes).not.toContain('shadow-md')
		})

		it('applies small shadow', () => {
			const classes = cardVariants({ shadow: 'small' })

			expect(classes).toContain('shadow-sm')
		})

		it('applies medium shadow', () => {
			const classes = cardVariants({ shadow: 'medium' })

			expect(classes).toContain('shadow-md')
		})
	})

	describe('base classes', () => {
		it('includes card base styles', () => {
			const classes = cardVariants()

			expect(classes).toContain('bg-white')
			expect(classes).toContain('text-black')
			expect(classes).toContain('border')
			expect(classes).toContain('border-gray-200')
			expect(classes).toContain('rounded-lg')
		})
	})
})
