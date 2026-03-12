import { inputVariants } from '@/input/variants'

describe('inputVariants', () => {
	describe('defaults', () => {
		it('returns default type and medium size classes', () => {
			const classes = inputVariants()

			expect(classes).toContain('border-gray-200')
			expect(classes).toContain('h-9')
			expect(classes).toContain('px-3')
			expect(classes).toContain('text-sm')
			expect(classes).toContain('rounded-md')
		})
	})

	describe('type variants', () => {
		it('applies default variant classes', () => {
			const classes = inputVariants({ type: 'default' })

			expect(classes).toContain('border-gray-200')
			expect(classes).toContain('hover:border-gray-300')
			expect(classes).toContain('focus:border-gray-400')
		})

		it('applies error variant classes', () => {
			const classes = inputVariants({ type: 'error' })

			expect(classes).toContain('border-red-500')
			expect(classes).toContain('text-red-900')
			expect(classes).toContain('placeholder:text-red-400')
		})

		it('applies success variant classes', () => {
			const classes = inputVariants({ type: 'success' })

			expect(classes).toContain('border-green-500')
			expect(classes).toContain('focus:border-green-600')
		})
	})

	describe('size variants', () => {
		it('applies small size classes', () => {
			const classes = inputVariants({ size: 'small' })

			expect(classes).toContain('h-8')
			expect(classes).toContain('px-2.5')
			expect(classes).toContain('text-xs')
			expect(classes).toContain('rounded-md')
		})

		it('applies medium size classes', () => {
			const classes = inputVariants({ size: 'medium' })

			expect(classes).toContain('h-9')
			expect(classes).toContain('px-3')
			expect(classes).toContain('text-sm')
		})

		it('applies large size classes', () => {
			const classes = inputVariants({ size: 'large' })

			expect(classes).toContain('h-10')
			expect(classes).toContain('px-3.5')
			expect(classes).toContain('text-sm')
			expect(classes).toContain('rounded-lg')
		})
	})

	describe('base classes', () => {
		it('includes transition and focus utilities', () => {
			const classes = inputVariants()

			expect(classes).toContain('flex')
			expect(classes).toContain('w-full')
			expect(classes).toContain('bg-white')
			expect(classes).toContain('transition-colors')
			expect(classes).toContain('disabled:pointer-events-none')
			expect(classes).toContain('disabled:opacity-50')
		})
	})
})
