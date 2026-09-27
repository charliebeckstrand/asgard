import { createHash } from 'node:crypto'
import type { Logger } from 'saga/log'
import { createBreachCheck } from '../breached-passwords.js'

// SHA-1 of 'password123', split the way the range API splits it.
const hash = createHash('sha1').update('password123').digest('hex').toUpperCase()

const prefix = hash.slice(0, 5)

const suffix = hash.slice(5)

function fakeLog() {
	return { warn: vi.fn() }
}

function answer(body: string, status = 200) {
	const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status }))

	vi.stubGlobal('fetch', fetchMock)

	return fetchMock
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('createBreachCheck', () => {
	it('sends only the first five characters of the hash, asking for padding', async () => {
		const fetchMock = answer('')

		await createBreachCheck(fakeLog() as unknown as Logger)('password123')

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

		expect(url).toBe(`https://api.pwnedpasswords.com/range/${prefix}`)

		expect(init.headers).toEqual({ 'Add-Padding': 'true', 'User-Agent': 'bifrost' })
	})

	it('finds a breached password', async () => {
		answer(`0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n${suffix}:12345\r\n`)

		expect(await createBreachCheck(fakeLog() as unknown as Logger)('password123')).toBe(true)
	})

	it('passes a password that only appears as padding', async () => {
		answer(`${suffix}:0\r\n`)

		expect(await createBreachCheck(fakeLog() as unknown as Logger)('password123')).toBe(false)
	})

	it('passes the password and logs when the service fails', async () => {
		answer('down', 503)

		const log = fakeLog()

		expect(await createBreachCheck(log as unknown as Logger)('password123')).toBe(false)

		expect(log.warn).toHaveBeenCalled()
	})
})
