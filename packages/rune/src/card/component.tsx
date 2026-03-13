import type { HTMLAttributes } from 'react'

import { cardVariants } from './variants.js'

export type CardProps = HTMLAttributes<HTMLDivElement> & {
	padding?: 'none' | 'small' | 'medium' | 'large'
	shadow?: 'none' | 'small' | 'medium'
}

export function Card({ padding, shadow, className, children, ...rest }: CardProps) {
	return (
		<div className={cardVariants({ padding, shadow, className })} {...rest}>
			{children}
		</div>
	)
}
