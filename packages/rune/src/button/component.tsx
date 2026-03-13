import type { ButtonHTMLAttributes } from 'react'

import type { Size, Type } from '../types/index.js'

import { buttonVariants } from './variants.js'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
	type?: Type
	size?: Size
}

export function Button({ type, size, className, children, ...rest }: ButtonProps) {
	return (
		<button className={buttonVariants({ type, size, className })} {...rest}>
			{children}
		</button>
	)
}
