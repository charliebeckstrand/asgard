import type { Child } from 'hono/jsx'

import type { Size, Type } from '../types/index.js'

import { buttonVariants } from './variants.js'

export type ButtonProps = {
	type?: Type
	size?: Size
	disabled?: boolean
	class?: string
	children?: Child
}

export function Button({ type, size, disabled, class: className, children, ...rest }: ButtonProps) {
	return (
		<button class={buttonVariants({ type, size, className })} disabled={disabled} {...rest}>
			{children}
		</button>
	)
}
