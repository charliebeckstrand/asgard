import type { InputHTMLAttributes } from 'react'

import type { Size } from '../types/index.js'

import { inputVariants } from './variants.js'

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
	type?: 'default' | 'error' | 'success'
	inputType?: string
	size?: Exclude<Size, 'tiny'>
}

export function Input({ type, inputType, size, className, ...rest }: InputProps) {
	return (
		<input
			type={inputType ?? 'text'}
			className={inputVariants({ type, size, className })}
			{...rest}
		/>
	)
}
