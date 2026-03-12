import { Hono } from 'hono'
import { RegisterForm } from 'rune'
import { Layout } from '../layout.js'
import { environment } from '../lib/env.js'

const register = new Hono()

register.get('/register', (c) => {
	const error = c.req.query('error')

	const errorMessage =
		error === 'password_mismatch'
			? 'Passwords do not match.'
			: error === 'email_exists'
				? 'An account with that email already exists.'
				: error
					? 'Registration failed. Please try again.'
					: ''

	return c.html(
		<Layout title="Create account">
			<div
				class="w-full max-w-sm space-y-4"
				x-data={`asyncForm('${errorMessage}', '/login?registered=true')`}
				x-on:submit="submit"
			>
				<h1 class="text-2xl font-semibold text-center">Create account</h1>

				<p x-show="error" x-text="error" class="text-sm text-red-600 text-center" />

				<RegisterForm action="/register" method="post" />

				<p class="text-sm text-center text-gray-500">
					Already have an account?{' '}
					<a href="/login" class="text-blue hover:underline">
						Sign in
					</a>
				</p>
			</div>
		</Layout>,
	)
})

register.post('/register', async (c) => {
	const env = environment()
	const wantsJson = c.req.header('accept')?.includes('application/json')

	const body = await c.req.parseBody()

	if (body.password !== body.confirmPassword) {
		if (wantsJson) {
			return c.json({ error: 'password_mismatch', message: 'Passwords do not match.' }, 400)
		}

		return c.redirect('/register?error=password_mismatch')
	}

	const res = await fetch(`${env.BIFROST_URL}/auth/register`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: body.email,
			password: body.password,
			name: body.name,
		}),
	})

	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { code?: string }

		if (wantsJson) {
			const message =
				data.code === 'email_exists'
					? 'An account with that email already exists.'
					: 'Registration failed. Please try again.'

			return c.json({ error: data.code ?? 'failed', message }, 400)
		}

		if (data.code === 'email_exists') {
			return c.redirect('/register?error=email_exists')
		}

		return c.redirect('/register?error=failed')
	}

	if (wantsJson) {
		return c.json({ success: true })
	}

	return c.redirect('/login?registered=true')
})

export { register }
