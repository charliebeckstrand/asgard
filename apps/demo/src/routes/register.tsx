import { Hono } from 'hono'
import { RegisterForm } from 'rune'
import { Layout } from '../layout.js'
import { environment } from '../lib/env.js'

const register = new Hono()

register.get('/register', (c) => {
	const error = c.req.query('error')

	return c.html(
		<Layout title="Create account">
			<div class="w-full max-w-sm space-y-4">
				<h1 class="text-2xl font-semibold text-center">Create account</h1>

				{error === 'password_mismatch' && (
					<p class="text-sm text-red-600 text-center">Passwords do not match.</p>
				)}

				{error === 'email_exists' && (
					<p class="text-sm text-red-600 text-center">An account with that email already exists.</p>
				)}

				{error && error !== 'password_mismatch' && error !== 'email_exists' && (
					<p class="text-sm text-red-600 text-center">Registration failed. Please try again.</p>
				)}

				<RegisterForm action="/register" method="post" />

				<p class="text-sm text-center text-gray-500">
					Already have an account?{' '}
					<a href="/login" class="text-blue-600 hover:underline">
						Sign in
					</a>
				</p>
			</div>
		</Layout>,
	)
})

register.post('/register', async (c) => {
	const env = environment()

	const body = await c.req.parseBody()

	if (body.password !== body.confirmPassword) {
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

		if (data.code === 'email_exists') {
			return c.redirect('/register?error=email_exists')
		}

		return c.redirect('/register?error=failed')
	}

	return c.redirect('/login?registered=true')
})

export { register }
