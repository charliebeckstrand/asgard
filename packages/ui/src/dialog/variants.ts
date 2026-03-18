import { cva } from 'class-variance-authority'

export const overlayVariants = cva([
	'fixed inset-0 z-50',
	'bg-black/50',
	'flex items-center justify-center',
])

export const dialogVariants = cva(
	[
		'relative z-50',
		'bg-white rounded-lg shadow-xl',
		'outline-none',
		'animate-in fade-in-0 zoom-in-95',
	],
	{
		variants: {
			size: {
				small: 'w-full max-w-sm p-4',
				medium: 'w-full max-w-md p-6',
				large: 'w-full max-w-lg p-6',
			},
		},

		defaultVariants: {
			size: 'medium',
		},
	},
)
