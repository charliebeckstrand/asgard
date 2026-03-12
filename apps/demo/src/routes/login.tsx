import { Hono } from 'hono'
import { LoginForm } from 'rune'
import { Layout } from '../layout.js'
import { environment } from '../lib/env.js'

const login = new Hono()

login.get('/login', (c) => {
	const error = c.req.query('error')
	const registered = c.req.query('registered')

	const initialError = error ? 'Invalid email or password.' : ''

	return c.html(
		<Layout title="Sign in">
			<div
				class="w-full max-w-sm space-y-4"
				x-data={`asyncForm('${initialError}')`}
				x-on:submit="submit"
			>
				<h1 class="text-2xl font-semibold text-center">Sign in</h1>

				{registered && (
					<p class="text-sm text-green-600 text-center">
						Account created successfully. Please sign in.
					</p>
				)}

				<p x-show="error" x-text="error" class="text-sm text-red-600 text-center" />

				<LoginForm action="/login" method="post" />

				<p class="text-sm text-center text-gray-500">
					Don't have an account?{' '}
					<a href="/register" class="text-blue hover:underline">
						Create one
					</a>
				</p>
			</div>
		</Layout>,
	)
})

login.post('/login', async (c) => {
	const env = environment()

	const body = await c.req.parseBody()

	const res = await fetch(`${env.BIFROST_URL}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: body.email,
			password: body.password,
		}),
	})

	if (!res.ok) {
		const wantsJson = c.req.header('accept')?.includes('application/json')

		if (wantsJson) {
			return c.json({ error: 'invalid_credentials', message: 'Invalid email or password.' }, 401)
		}

		return c.redirect('/login?error=invalid_credentials')
	}

	const headers = new Headers({ Location: '/' })

	for (const cookie of res.headers.getSetCookie()) {
		headers.append('set-cookie', cookie)
	}

	return new Response(null, { status: 302, headers })
})

export { login }
