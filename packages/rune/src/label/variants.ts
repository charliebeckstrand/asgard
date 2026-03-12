import { cva } from 'class-variance-authority'

export const labelVariants = cva(['font-medium text-gray-700'], {
	variants: {
		size: {
			small: 'text-xs',
			medium: 'text-sm',
		},
	},

	defaultVariants: {
		size: 'medium',
	},
})
