import type { Logger } from 'saga/log'
import { createTurnstileCheck } from '../turnstile.js'

function fakeLog() {
	return { error: vi.fn() } as unknown as Logger
}

function answer(body: unknown, status = 200) {
	const fetchMock = vi.fn().mockResolvedValue(Response.json(body, { status }))

	vi.stubGlobal('fetch', fetchMock)

	return fetchMock
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('createTurnstileCheck', () => {
	it('sends the secret, the token and the address to Cloudflare', async () => {
		const fetchMock = answer({ success: true })

		await createTurnstileCheck('secret', fakeLog())('token', '203.0.113.1')

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

		expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')

		expect(JSON.parse(init.body as string)).toEqual({
			secret: 'secret',
			response: 'token',
			remoteip: '203.0.113.1',
		})
	})

	it.each([true, false])('returns what Cloudflare answers (%s)', async (success) => {
		answer({ success })

		expect(await createTurnstileCheck('secret', fakeLog())('token')).toBe(success)
	})

	it('fails the token when Cloudflare does not answer', async () => {
		answer({}, 500)

		const log = fakeLog()

		expect(await createTurnstileCheck('secret', log)('token')).toBe(false)

		expect(log.error).toHaveBeenCalled()
	})
})
