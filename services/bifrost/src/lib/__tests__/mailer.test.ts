import type { Logger } from 'saga/log'
import { createMailer } from '../mailer.js'

const email = { to: 'alice@example.com', subject: 'Verify your email', text: 'https://link' }

function fakeLog() {
	return { warn: vi.fn() }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('createMailer', () => {
	it('sends the email through Resend', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

		vi.stubGlobal('fetch', fetchMock)

		const send = createMailer({
			apiKey: 're_key',
			from: 'App <no-reply@example.com>',
			production: true,
			log: fakeLog() as unknown as Logger,
		})

		await send(email)

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

		expect(url).toBe('https://api.resend.com/emails')

		expect(init.headers).toMatchObject({ Authorization: 'Bearer re_key' })

		expect(JSON.parse(init.body as string)).toEqual({
			from: 'App <no-reply@example.com>',
			...email,
		})
	})

	it('throws when Resend refuses the email', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 422 })))

		const send = createMailer({
			apiKey: 're_key',
			from: 'x@example.com',
			production: true,
			log: fakeLog() as unknown as Logger,
		})

		await expect(send(email)).rejects.toThrow('Resend answered 422: bad')
	})

	it('logs the email without an API key, with its text only outside production', async () => {
		const fetchMock = vi.fn()

		vi.stubGlobal('fetch', fetchMock)

		const devLog = fakeLog()

		const prodLog = fakeLog()

		await createMailer({ from: 'x', production: false, log: devLog as unknown as Logger })(email)

		await createMailer({ from: 'x', production: true, log: prodLog as unknown as Logger })(email)

		expect(fetchMock).not.toHaveBeenCalled()

		expect(devLog.warn.mock.calls[0]?.[0]).toMatchObject({ text: 'https://link' })

		expect(prodLog.warn.mock.calls[0]?.[0]).toMatchObject({ text: undefined })
	})
})
