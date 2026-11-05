import { stubServiceEnv } from 'vali/env'

stubServiceEnv({ MIMIR_API_KEY: 'test-mimir-api-key-that-is-at-least-32-chars' })

const { mockDeletePhotos, mockKeepPhoto } = vi.hoisted(() => ({
	mockDeletePhotos: vi.fn(),
	mockKeepPhoto: vi.fn(),
}))

vi.mock('../../handlers/documents.js', () => import('./documents-mock.js'))

vi.mock('../../lib/storage.js', async (original) => ({
	...(await original<typeof import('../../lib/storage.js')>()),
	deletePhotos: mockDeletePhotos,
	keepPhoto: mockKeepPhoto,
}))

import { migratePhotoViews } from '../../handlers/photo-views.js'
import { documents } from './documents-mock.js'

const USER = '00000000-0000-4000-8000-000000000001'

/** A key saved before views. */
const flat = (name: string) => `users/${USER}/${name}.jpg`

/** The key the migration moves it to. */
const saved = (name: string) => `users/${USER}/${name}/original.jpg`

const place = (photos: string[]) => ({
	id: 'place-1',
	createdAt: '2026-09-27T12:00:00.000Z',
	name: 'Cafe',
	category: 'food',
	address: '1 Main St',
	latitude: 40,
	longitude: -80,
	visits: [{ id: 'visit-1', visitedAt: '2026-09-27', rating: 4, photos }],
})

const trip = (photos: string[]) => ({
	id: 'trip-1',
	createdAt: '2026-09-27T12:00:00.000Z',
	name: 'Coast',
	startsOn: '2026-09-27',
	endsOn: '2026-09-28',
	address: 'Oregon',
	latitude: 45,
	longitude: -123,
	photos,
})

beforeEach(() => {
	documents.clear()

	mockDeletePhotos.mockReset().mockResolvedValue(undefined)

	mockKeepPhoto.mockReset().mockResolvedValue(true)
})

describe('photo view migration', () => {
	it('moves each flat photo of the places and trips to its saved key, and deletes the flat one', async () => {
		documents.set(`${USER}:places`, [place([flat('a'), saved('b')])])

		documents.set(`${USER}:trips`, [trip([flat('c')])])

		expect(await migratePhotoViews()).toEqual({ moved: 2, missing: 0 })

		expect(mockKeepPhoto.mock.calls).toEqual([[flat('a')], [flat('c')]])

		expect(documents.get(`${USER}:places`)).toEqual([place([saved('a'), saved('b')])])

		expect(documents.get(`${USER}:trips`)).toEqual([trip([saved('c')])])

		expect(mockDeletePhotos).toHaveBeenCalledExactlyOnceWith([flat('a'), flat('c')])
	})

	it('keeps the flat key of a photo missing from the bucket, and writes no document it leaves', async () => {
		documents.set(`${USER}:places`, [place([flat('a')])])

		mockKeepPhoto.mockResolvedValue(false)

		expect(await migratePhotoViews()).toEqual({ moved: 0, missing: 1 })

		expect(documents.get(`${USER}:places`)).toEqual([place([flat('a')])])

		expect(documents.has(`${USER}:trips`)).toBe(false)

		expect(mockDeletePhotos).not.toHaveBeenCalled()
	})

	it('finds nothing to move on a second run', async () => {
		documents.set(`${USER}:places`, [place([flat('a')])])

		await migratePhotoViews()

		mockKeepPhoto.mockClear()

		expect(await migratePhotoViews()).toEqual({ moved: 0, missing: 0 })

		expect(mockKeepPhoto).not.toHaveBeenCalled()
	})
})
