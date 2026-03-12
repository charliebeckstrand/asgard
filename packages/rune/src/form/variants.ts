import { cva } from 'class-variance-authority'

export const formVariants = cva(['flex flex-col w-full'], {
	variants: {
		spacing: {
			compact: 'gap-3',
			default: 'gap-4',
			relaxed: 'gap-6',
		},
	},

	defaultVariants: {
		spacing: 'default',
	},
})
