import type { Child } from 'hono/jsx'

import { formVariants } from './variants.js'

export type FormProps = {
	action?: string
	method?: 'get' | 'post' | 'dialog'
	spacing?: 'compact' | 'default' | 'relaxed'
	class?: string
	children?: Child
}

export function Form({ action, method, spacing, class: className, children, ...rest }: FormProps) {
	return (
		<form action={action} method={method} class={formVariants({ spacing, className })} {...rest}>
			{children}
		</form>
	)
}
