import type { FormHTMLAttributes } from 'react'

import { formVariants } from './variants.js'

export type FormProps = Omit<FormHTMLAttributes<HTMLFormElement>, 'method'> & {
	method?: 'get' | 'post' | 'dialog'
	spacing?: 'compact' | 'default' | 'relaxed'
}

export function Form({ method, spacing, className, children, ...rest }: FormProps) {
	return (
		<form method={method} className={formVariants({ spacing, className })} {...rest}>
			{children}
		</form>
	)
}
