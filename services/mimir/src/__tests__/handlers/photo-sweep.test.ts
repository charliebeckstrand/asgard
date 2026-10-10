import { stubServiceEnv } from 'vali/env'

stubServiceEnv({ MIMIR_API_KEY: 'test-mimir-api-key-that-is-at-least-32-chars' })

const { mockListPhotos, mockDeletePhotos, unreadable } = vi.hoisted(() => ({
	mockListPhotos: vi.fn(),
	mockDeletePhotos: vi.fn(),
	// Users whose documents fail to read.
	unreadable: new Set<string>(),
}))

vi.mock('../../handlers/documents.js', async () => {
	const mock = await import('./documents-mock.js')

	return {
		...mock,
		changeDocuments: (...args: Parameters<typeof mock.changeDocuments>) =>
			unreadable.has(args[0]) ? Promise.reject(new Error('down')) : mock.changeDocuments(...args),
	}
})

vi.mock('../../lib/storage.js', () => ({
	listPhotos: mockListPhotos,
	deletePhotos: mockDeletePhotos,
}))

import { sweepPhotos } from '../../handlers/photo-sweep.js'
import { documents } from './documents-mock.js'

const USER = '00000000-0000-4000-8000-000000000001'

const GONE = '00000000-0000-4000-8000-000000000002'

const DAY = 24 * 60 * 60 * 1000

const key = (userId: string, name: string) => `users/${userId}/${name}.jpg`

/** An object written `days` ago. */
const object = (name: string, days: number, userId = USER) => ({
	key: key(userId, name),
	modified: new Date(Date.now() - days * DAY),
})

const visit = (photos: string[]) => ({ id: 'v', visitedAt: '2026-09-27', rating: 4, photos })

/** Every key the sweep deleted, across its calls. */
const deleted = () => mockDeletePhotos.mock.calls.flatMap(([keys]) => keys)

beforeEach(() => {
	documents.clear()

	unreadable.clear()

	mockListPhotos.mockReset()

	mockDeletePhotos.mockReset().mockResolvedValue([])
})

describe('sweepPhotos', () => {
	it('keeps every key a visit or trip holds', async () => {
		documents.set(`${USER}:places`, [{ id: 'p', visits: [visit([key(USER, 'a')])] }])

		documents.set(`${USER}:trips`, [{ id: 't', photos: [key(USER, 'b')] }])

		mockListPhotos.mockResolvedValue([object('a', 2), object('b', 2)])

		const tally = await sweepPhotos({ deletes: true })

		expect(deleted()).toEqual([])

		expect(tally).toMatchObject({ listed: 2, old: 2, kept: 2, deleted: 0, errors: 0 })
	})

	it('keeps a key held by a record the schema cannot read', async () => {
		documents.set(`${USER}:places`, [{ id: 'old', photo: key(USER, 'a') }])

		mockListPhotos.mockResolvedValue([object('a', 2)])

		await sweepPhotos({ deletes: true })

		expect(deleted()).toEqual([])
	})

	it('deletes an old object nothing holds, and every object of a deleted account', async () => {
		documents.set(`${USER}:places`, [{ id: 'p', visits: [visit([key(USER, 'a')])] }])

		mockListPhotos.mockResolvedValue([
			object('a', 2),
			object('b', 2),
			object('c', 3, GONE),
			object('d', 2, GONE),
		])

		const tally = await sweepPhotos({ deletes: true })

		expect(deleted().sort()).toEqual([key(USER, 'b'), key(GONE, 'c'), key(GONE, 'd')])

		expect(tally).toMatchObject({ old: 4, candidates: 3, deleted: 3, kept: 1 })
	})

	it('keeps an object nothing holds while it is under a day old', async () => {
		mockListPhotos.mockResolvedValue([object('a', 0.9)])

		const tally = await sweepPhotos({ deletes: true })

		expect(mockDeletePhotos).not.toHaveBeenCalled()

		expect(tally).toMatchObject({ listed: 1, old: 0 })
	})

	it('leaves alone a key it cannot read', async () => {
		mockListPhotos.mockResolvedValue([{ key: 'users/not-a-user/a.jpg', modified: new Date(0) }])

		await sweepPhotos({ deletes: true })

		expect(mockDeletePhotos).not.toHaveBeenCalled()
	})

	it('deletes nothing for a user whose documents fail to read, and goes on', async () => {
		unreadable.add(USER)

		mockListPhotos.mockResolvedValue([object('a', 2), object('b', 2, GONE)])

		const tally = await sweepPhotos({ deletes: true })

		expect(deleted()).toEqual([key(GONE, 'b')])

		expect(tally).toMatchObject({ deleted: 1, errors: 1 })
	})

	it('counts the deletes the bucket refuses', async () => {
		mockListPhotos.mockResolvedValue([object('a', 2), object('b', 2)])

		mockDeletePhotos.mockResolvedValue([{ key: key(USER, 'a'), err: new Error('refused') }])

		const tally = await sweepPhotos({ deletes: true })

		expect(tally).toMatchObject({ candidates: 2, deleted: 1, errors: 1 })
	})

	it('with deletes off, finds its candidates and deletes nothing', async () => {
		mockListPhotos.mockResolvedValue([object('a', 2)])

		const tally = await sweepPhotos({ deletes: false })

		expect(mockDeletePhotos).not.toHaveBeenCalled()

		expect(tally).toMatchObject({ candidates: 1, deleted: 0 })
	})
})
