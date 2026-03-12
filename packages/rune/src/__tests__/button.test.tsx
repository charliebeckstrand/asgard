import { buttonVariants } from '@/button/variants'

describe('buttonVariants', () => {
	describe('defaults', () => {
		it('returns default type and medium size classes', () => {
			const classes = buttonVariants()

			expect(classes).toContain('bg-black')
			expect(classes).toContain('text-white')
			expect(classes).toContain('h-9')
			expect(classes).toContain('px-3.5')
			expect(classes).toContain('text-sm')
			expect(classes).toContain('rounded-md')
		})
	})

	describe('type variants', () => {
		it('applies default variant classes', () => {
			const classes = buttonVariants({ type: 'default' })

			expect(classes).toContain('bg-black')
			expect(classes).toContain('text-white')
			expect(classes).toContain('hover:bg-gray-800')
		})

		it('applies secondary variant classes', () => {
			const classes = buttonVariants({ type: 'secondary' })

			expect(classes).toContain('bg-white')
			expect(classes).toContain('text-black')
			expect(classes).toContain('border')
			expect(classes).toContain('border-gray-200')
		})

		it('applies tertiary variant classes', () => {
			const classes = buttonVariants({ type: 'tertiary' })

			expect(classes).toContain('bg-transparent')
			expect(classes).toContain('text-gray-600')
			expect(classes).toContain('hover:bg-gray-100')
		})

		it('applies warning variant classes', () => {
			const classes = buttonVariants({ type: 'warning' })

			expect(classes).toContain('bg-amber-500')
			expect(classes).toContain('text-white')
			expect(classes).toContain('hover:bg-amber-600')
		})

		it('applies error variant classes', () => {
			const classes = buttonVariants({ type: 'error' })

			expect(classes).toContain('bg-red-600')
			expect(classes).toContain('text-white')
			expect(classes).toContain('hover:bg-red-700')
		})
	})

	describe('size variants', () => {
		it('applies tiny size classes', () => {
			const classes = buttonVariants({ size: 'tiny' })

			expect(classes).toContain('h-7')
			expect(classes).toContain('px-2.5')
			expect(classes).toContain('text-xs')
			expect(classes).toContain('rounded-md')
		})

		it('applies small size classes', () => {
			const classes = buttonVariants({ size: 'small' })

			expect(classes).toContain('h-8')
			expect(classes).toContain('px-3')
			expect(classes).toContain('text-xs')
		})

		it('applies medium size classes', () => {
			const classes = buttonVariants({ size: 'medium' })

			expect(classes).toContain('h-9')
			expect(classes).toContain('px-3.5')
			expect(classes).toContain('text-sm')
		})

		it('applies large size classes', () => {
			const classes = buttonVariants({ size: 'large' })

			expect(classes).toContain('h-10')
			expect(classes).toContain('px-4')
			expect(classes).toContain('text-sm')
			expect(classes).toContain('rounded-lg')
		})
	})

	describe('base classes', () => {
		it('includes transition and focus utilities', () => {
			const classes = buttonVariants()

			expect(classes).toContain('inline-flex')
			expect(classes).toContain('items-center')
			expect(classes).toContain('justify-center')
			expect(classes).toContain('font-medium')
			expect(classes).toContain('transition-colors')
			expect(classes).toContain('disabled:pointer-events-none')
			expect(classes).toContain('disabled:opacity-50')
		})
	})
})
