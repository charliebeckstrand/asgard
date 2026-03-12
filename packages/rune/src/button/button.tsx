import type { Child } from 'hono/jsx'

import { buttonVariants } from './variants.js'

export type ButtonProps = {
	type?: 'default' | 'secondary' | 'warning' | 'error' | 'tertiary'
	size?: 'tiny' | 'small' | 'medium' | 'large'
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
