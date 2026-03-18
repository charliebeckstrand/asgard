import { type HTMLAttributes, type MouseEvent, useCallback, useEffect, useRef } from 'react'

import { dialogVariants, overlayVariants } from './variants.js'

export type DialogProps = Omit<HTMLAttributes<HTMLDivElement>, 'role'> & {
	open: boolean
	onClose: () => void
	outsideClick?: boolean
	size?: 'small' | 'medium' | 'large'
}

export function Dialog({
	open,
	onClose,
	outsideClick = true,
	size,
	className,
	children,
	...rest
}: DialogProps) {
	const dialogRef = useRef<HTMLDivElement>(null)

	const handleOverlayClick = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (outsideClick && event.target === event.currentTarget) {
				onClose()
			}
		},
		[outsideClick, onClose],
	)

	useEffect(() => {
		if (!open) return

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				onClose()
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [open, onClose])

	if (!open) return null

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: overlay acts as a dismiss target, keyboard handled via Escape listener
		<div role="presentation" className={overlayVariants()} onClick={handleOverlayClick}>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				className={dialogVariants({ size, className })}
				{...rest}
			>
				{children}
			</div>
		</div>
	)
}
