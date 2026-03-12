import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
	[
		'inline-flex items-center justify-center',
		'outline-none',
		'font-medium whitespace-nowrap',
		'transition-colors duration-150 ease-in-out',
		'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black',
		'disabled:pointer-events-none disabled:opacity-50',
	],
	{
		variants: {
			type: {
				default: 'bg-black text-white hover:bg-gray-800 active:bg-gray-700',

				secondary: [
					'bg-white text-black',
					'border border-gray-200',
					'hover:border-gray-300 hover:bg-gray-50',
					'active:bg-gray-100',
				],

				tertiary: [
					'bg-transparent text-gray-600',
					'hover:bg-gray-100 hover:text-black',
					'active:bg-gray-200',
				],

				warning: 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700',

				error: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
			},

			size: {
				tiny: 'h-7 px-2.5 text-xs rounded-md gap-1',
				small: 'h-8 px-3 text-xs rounded-md gap-1.5',
				medium: 'h-9 px-3.5 text-sm rounded-md gap-1.5',
				large: 'h-10 px-4 text-sm rounded-lg gap-2',
			},
		},

		defaultVariants: {
			type: 'default',
			size: 'medium',
		},
	},
)
