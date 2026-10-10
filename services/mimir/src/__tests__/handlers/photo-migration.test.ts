import { stubServiceEnv } from 'vali/env'

stubServiceEnv({ MIMIR_API_KEY: 'test-mimir-api-key-that-is-at-least-32-chars' })

const { mockPutPhoto } = vi.hoisted(() => ({ mockPutPhoto: vi.fn() }))

vi.mock('../../handlers/documents.js', () => import('./documents-mock.js'))

vi.mock('../../lib/storage.js', async (original) => ({
	...(await original<typeof import('../../lib/storage.js')>()),
	putPhoto: mockPutPhoto,
}))

import { migratePhotos } from '../../handlers/photo-migration.js'
import { documents } from './documents-mock.js'

const USER = '00000000-0000-4000-8000-000000000001'

const KEY = new RegExp(`^users/${USER}/[0-9a-f-]{36}\\.(jpg|png)$`)

const place = (photos: unknown[]) => ({
	id: 'place-1',
	createdAt: '2026-09-27T12:00:00.000Z',
	name: 'Cafe',
	category: 'food',
	address: '1 Main St',
	latitude: 40,
	longitude: -80,
	visits: [{ id: 'visit-1', visitedAt: '2026-09-27', rating: 4, photos }],
})

/** The photos of the stored place's one visit. */
function storedPhotos(): unknown[] {
	const [stored] = documents.get(`${USER}:places`) as ReturnType<typeof place>[]

	return stored?.visits[0]?.photos ?? []
}

const answers: Record<string, () => Response> = {
	'https://example.com/a.jpg': () =>
		new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
	'https://example.com/b.png': () =>
		new Response(new Uint8Array([4]), { headers: { 'content-type': 'image/png; charset=binary' } }),
	'https://example.com/gone.jpg': () => new Response('Not found', { status: 404 }),
	'https://example.com/page': () =>
		new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
	'https://example.com/down.jpg': () => new Response('Unavailable', { status: 503 }),
}

beforeEach(() => {
	documents.clear()

	mockPutPhoto.mockReset().mockResolvedValue(undefined)

	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			const answer = answers[url]

			if (!answer) throw new Error('unreachable')

			return answer()
		}),
	)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('photo migration', () => {
	it('copies each web photo into the bucket and stores its key in its place', async () => {
		documents.set(`${USER}:places`, [
			place(['https://example.com/a.jpg', 'https://example.com/b.png']),
		])

		expect(await migratePhotos()).toEqual({ copied: 2, dropped: 0, kept: 0 })

		const [first, second] = storedPhotos()

		expect(first).toMatch(KEY)

		expect(second).toMatch(KEY)

		expect(mockPutPhoto).toHaveBeenCalledWith(first, new Uint8Array([1, 2, 3]), 'image/jpeg')

		expect(mockPutPhoto).toHaveBeenCalledWith(second, new Uint8Array([4]), 'image/png')
	})

	it('drops an address that holds no image, and keeps one that may work later', async () => {
		documents.set(`${USER}:places`, [
			place([
				'https://example.com/gone.jpg',
				'https://example.com/page',
				'https://example.com/down.jpg',
				'https://unreachable.example/c.jpg',
			]),
		])

		expect(await migratePhotos()).toEqual({ copied: 0, dropped: 2, kept: 2 })

		expect(storedPhotos()).toEqual([
			'https://example.com/down.jpg',
			'https://unreachable.example/c.jpg',
		])

		expect(mockPutPhoto).not.toHaveBeenCalled()
	})

	it('keeps the address when the bucket refuses the copy', async () => {
		mockPutPhoto.mockRejectedValue(new Error('Access Denied.'))

		documents.set(`${USER}:places`, [place(['https://example.com/a.jpg'])])

		expect(await migratePhotos()).toEqual({ copied: 0, dropped: 0, kept: 1 })

		expect(storedPhotos()).toEqual(['https://example.com/a.jpg'])
	})

	it('copies the photo of a place stored before visits', async () => {
		const { visits: _visits, ...rest } = place([])

		documents.set(`${USER}:places`, [
			{ ...rest, visitedAt: '2026-09-27', rating: 4, photo: 'https://example.com/a.jpg' },
		])

		await migratePhotos()

		expect(storedPhotos()).toEqual([expect.stringMatching(KEY)])
	})

	it('leaves a document with only keys as it is', async () => {
		const stored = [place([`users/${USER}/00000000-0000-4000-8000-00000000000a.jpg`])]

		documents.set(`${USER}:places`, stored)

		expect(await migratePhotos()).toEqual({ copied: 0, dropped: 0, kept: 0 })

		expect(documents.get(`${USER}:places`)).toBe(stored)
	})
})
