import type { LabelHTMLAttributes } from 'react'

import { labelVariants } from './variants.js'

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
	size?: 'small' | 'medium'
}

export function Label({ htmlFor, size, className, children, ...rest }: LabelProps) {
	return (
		<label htmlFor={htmlFor} className={labelVariants({ size, className })} {...rest}>
			{children}
		</label>
	)
}
