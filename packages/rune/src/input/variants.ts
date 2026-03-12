import { cva } from 'class-variance-authority'

export const inputVariants = cva(
	[
		'flex w-full bg-white text-black',
		'outline-none',
		'placeholder:text-gray-400',
		'transition-colors duration-150 ease-in-out',
		'border',
		'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black',
		'disabled:pointer-events-none disabled:opacity-50',
	],
	{
		variants: {
			type: {
				default: 'border-gray-200 hover:border-gray-300 focus:border-gray-400',

				error: 'border-red-500 text-red-900 placeholder:text-red-400 focus:border-red-600',

				success: 'border-green-500 focus:border-green-600',
			},

			size: {
				small: 'h-8 px-2.5 text-xs rounded-md',
				medium: 'h-9 px-3 text-sm rounded-md',
				large: 'h-10 px-3.5 text-base rounded-lg',
			},
		},

		defaultVariants: {
			type: 'default',
			size: 'medium',
		},
	},
)
