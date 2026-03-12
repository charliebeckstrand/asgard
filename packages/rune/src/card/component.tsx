import type { Child } from 'hono/jsx'

import { cardVariants } from './variants.js'

export type CardProps = {
	padding?: 'none' | 'small' | 'medium' | 'large'
	shadow?: 'none' | 'small' | 'medium'
	class?: string
	children?: Child
}

export function Card({ padding, shadow, class: className, children, ...rest }: CardProps) {
	return (
		<div class={cardVariants({ padding, shadow, className })} {...rest}>
			{children}
		</div>
	)
}
