declare const Alpine: {
	data: (name: string, callback: (...args: unknown[]) => Record<string, unknown>) => void
}

type AsyncFormState = {
	error: string
	submitting: boolean
	submit: (e: SubmitEvent) => Promise<void>
}

document.addEventListener('alpine:init', () => {
	Alpine.data('asyncForm', (initialError = '', redirectUrl = '/') => ({
		error: initialError as string,
		submitting: false,

		async submit(e: SubmitEvent) {
			e.preventDefault()

			const form = e.target as HTMLFormElement
			const self = this as unknown as AsyncFormState

			self.error = ''
			self.submitting = true

			try {
				const res = await fetch(form.action, {
					method: 'POST',
					headers: { Accept: 'application/json' },
					body: new FormData(form),
				})

				if (res.ok) {
					window.location.href = redirectUrl as string

					return
				}

				const data: { message?: string } = await res.json().catch(() => ({}))

				self.error = data.message || 'Something went wrong.'
			} catch {
				self.error = 'Something went wrong. Please try again.'
			} finally {
				self.submitting = false
			}
		},
	}))
})
