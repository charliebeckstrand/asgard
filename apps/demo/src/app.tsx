import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { Layout } from './layout.js'
import { environment } from './lib/env.js'
import { setupLivereload } from './lib/livereload.js'
import { auth } from './middleware/auth.js'
import { login } from './routes/login.js'
import { register } from './routes/register.js'

export function createDemoApp() {
	const env = environment()

	const app = new Hono()

	if (process.env.NODE_ENV !== 'production') {
		setupLivereload(app)
	}

	app.use('/styles.css', serveStatic({ root: './dist' }))

	app.use('*', auth(env.SESSION_SECRET))

	app.route('/', login)
	app.route('/', register)

	app.get('/', (c) => {
		return c.html(
			<Layout title="Demo">
				<div class="text-center space-y-4">
					<h1 class="text-3xl font-semibold">Welcome</h1>

					<p class="text-gray-600">You are signed in.</p>

					<a
						href="/logout"
						class="inline-block px-4 py-2 text-sm text-white bg-gray-900 rounded hover:bg-gray-700"
					>
						Sign out
					</a>
				</div>
			</Layout>,
		)
	})

	app.get('/logout', async (c) => {
		await fetch(`${env.BIFROST_URL}/auth/logout`, {
			method: 'POST',
			headers: {
				cookie: c.req.header('cookie') ?? '',
			},
		}).catch(() => {})

		c.header('set-cookie', 'bifrost_session=; Path=/; Max-Age=0')

		return c.redirect('/login')
	})

	return app
}
