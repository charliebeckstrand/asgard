import { stubServiceEnv } from 'vali/env'

stubServiceEnv({
	MIMIR_API_KEY: 'test-mimir-api-key-that-is-at-least-32-chars',
	SPACES_KEY: 'key',
	SPACES_SECRET: 'secret',
	SPACES_REGION: 'nyc3',
	SPACES_BUCKET: 'ivory-photos',
	// The bucket's own endpoint, as the dashboard shows it.
	SPACES_ENDPOINT: 'https://ivory-photos.nyc3.digitaloceanspaces.com',
})

import { photoUrl, uploadUrl } from '../../lib/storage.js'

const KEY = 'users/00000000-0000-4000-8000-000000000001/a.jpg'

const BUCKET_URL = 'https://ivory-photos.nyc3.digitaloceanspaces.com'

afterEach(() => {
	vi.useRealTimers()
})

describe('storage', () => {
	it('signs an upload for five minutes, bound to its type and size', async () => {
		const url = new URL(await uploadUrl(KEY, 'image/jpeg', 1234))

		expect(`${url.origin}${url.pathname}`).toBe(`${BUCKET_URL}/${KEY}`)

		expect(url.searchParams.get('X-Amz-Expires')).toBe('300')

		expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host')
	})

	it('signs a read for an hour, the same URL within a quarter hour', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-10T12:16:00Z'), toFake: ['Date'] })

		const first = await photoUrl(KEY)

		vi.setSystemTime(new Date('2026-10-10T12:29:59Z'))

		expect(await photoUrl(KEY)).toBe(first)

		const url = new URL(first)

		expect(url.searchParams.get('X-Amz-Date')).toBe('20261010T121500Z')

		expect(url.searchParams.get('X-Amz-Expires')).toBe('3600')

		vi.setSystemTime(new Date('2026-10-10T12:30:00Z'))

		expect(await photoUrl(KEY)).not.toBe(first)
	})
})
