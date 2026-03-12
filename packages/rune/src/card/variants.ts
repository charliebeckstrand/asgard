import { cva } from 'class-variance-authority'

export const cardVariants = cva(['bg-white text-black', 'border border-gray-200', 'rounded-lg'], {
	variants: {
		padding: {
			none: '',
			small: 'p-2',
			medium: 'p-4',
			large: 'p-6',
		},

		shadow: {
			none: '',
			small: 'shadow-sm',
			medium: 'shadow-md',
		},
	},

	defaultVariants: {
		padding: 'medium',
		shadow: 'none',
	},
})
