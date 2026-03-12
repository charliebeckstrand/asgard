document.addEventListener('alpine:init', () => {
	Alpine.data('asyncForm', (initialError = '', redirectUrl = '/') => ({
		error: initialError,
		submitting: false,

		async submit(e) {
			e.preventDefault()
			this.error = ''
			this.submitting = true

			try {
				const res = await fetch(e.target.action, {
					method: 'POST',
					headers: { Accept: 'application/json' },
					body: new FormData(e.target),
				})

				if (res.ok) {
					window.location.href = redirectUrl

					return
				}

				const data = await res.json().catch(() => ({}))

				this.error = data.message || 'Something went wrong.'
			} catch {
				this.error = 'Something went wrong. Please try again.'
			} finally {
				this.submitting = false
			}
		},
	}))
})
