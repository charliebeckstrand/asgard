import { cva } from 'class-variance-authority'

export const cardVariants = cva(['bg-white text-black', 'border border-gray-200', 'rounded-lg'], {
	variants: {
		padding: {
			none: '',
			small: 'p-4',
			medium: 'p-6',
			large: 'p-8',
		},

		shadow: {
			none: '',
			small: 'shadow-sm',
			medium: 'shadow-md',
		},
	},

	defaultVariants: {
		padding: 'medium',
		shadow: 'small',
	},
})
