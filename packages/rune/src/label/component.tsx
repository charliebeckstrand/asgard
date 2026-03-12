import type { Child } from 'hono/jsx'

import { labelVariants } from './variants.js'

export type LabelProps = {
	htmlFor?: string
	size?: 'small' | 'medium'
	class?: string
	children?: Child
}

export function Label({ htmlFor, size, class: className, children, ...rest }: LabelProps) {
	return (
		<label for={htmlFor} class={labelVariants({ size, className })} {...rest}>
			{children}
		</label>
	)
}
