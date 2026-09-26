import { Hono } from 'hono'
import { type ClientIpOptions, clientIp, getIpAddress } from '../../network/ip.js'

const SECRET = 'a-client-ip-secret-of-at-least-32-chars'

function buildApp(options?: ClientIpOptions) {
	const app = new Hono()

	if (options) app.use('*', clientIp(options))

	app.get('/ip', (c) => c.text(getIpAddress(c)))

	return app
}

async function ipFor(app: Hono, headers: Record<string, string> = {}) {
	const res = await app.request('/ip', { headers })

	return res.text()
}

describe('clientIp', () => {
	it('reads the edge header', async () => {
		const app = buildApp({ header: 'do-connecting-ip' })

		await expect(ipFor(app, { 'do-connecting-ip': '203.0.113.7' })).resolves.toBe('203.0.113.7')
	})

	it('ignores an edge header that is not an IP', async () => {
		const app = buildApp({ header: 'do-connecting-ip' })

		await expect(ipFor(app, { 'do-connecting-ip': 'not-an-ip' })).resolves.toBe('unknown')
	})

	it("trusts the proxy's x-client-ip when the secret matches", async () => {
		const app = buildApp({ header: 'do-connecting-ip', secret: SECRET })

		const ip = ipFor(app, {
			'do-connecting-ip': '198.51.100.1',
			'x-client-ip': '2001:db8::1',
			'x-client-ip-secret': SECRET,
		})

		await expect(ip).resolves.toBe('2001:db8::1')
	})

	it('ignores x-client-ip with a wrong or missing secret', async () => {
		const app = buildApp({ header: 'do-connecting-ip', secret: SECRET })

		const wrong = ipFor(app, {
			'do-connecting-ip': '198.51.100.1',
			'x-client-ip': '203.0.113.7',
			'x-client-ip-secret': 'wrong',
		})

		await expect(wrong).resolves.toBe('198.51.100.1')

		const missing = ipFor(app, { 'do-connecting-ip': '198.51.100.1', 'x-client-ip': '203.0.113.7' })

		await expect(missing).resolves.toBe('198.51.100.1')
	})

	it('ignores x-client-ip when no secret is configured', async () => {
		const app = buildApp({ header: 'do-connecting-ip' })

		const ip = ipFor(app, {
			'do-connecting-ip': '198.51.100.1',
			'x-client-ip': '203.0.113.7',
			'x-client-ip-secret': '',
		})

		await expect(ip).resolves.toBe('198.51.100.1')
	})

	it('falls back to the edge header when the proxy sends no valid IP', async () => {
		const app = buildApp({ header: 'do-connecting-ip', secret: SECRET })

		const ip = ipFor(app, {
			'do-connecting-ip': '198.51.100.1',
			'x-client-ip': 'garbage',
			'x-client-ip-secret': SECRET,
		})

		await expect(ip).resolves.toBe('198.51.100.1')
	})
})

describe('getIpAddress', () => {
	it('fails without the middleware', async () => {
		const res = await buildApp().request('/ip')

		expect(res.status).toBe(500)
	})
})
