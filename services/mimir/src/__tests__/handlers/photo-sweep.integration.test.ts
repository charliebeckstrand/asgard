import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDockerAvailable, startPostgres } from 'vali/containers'
import { stubServiceEnv } from 'vali/env'

stubServiceEnv({ MIMIR_API_KEY: 'test-mimir-api-key-that-is-at-least-32-chars' })

const { holder, bucket, gates, reached } = vi.hoisted(() => ({
	holder: {} as { db?: import('saga').Db },
	// The bucket: each key and when it was written.
	bucket: new Map<string, Date>(),
	// Promises the storage calls wait on, to hold a lock open.
	gates: {} as { delete?: Promise<void>; exists?: Promise<void> },
	// The storage calls that have started.
	reached: new Set<'delete' | 'exists'>(),
}))

vi.mock('../../lib/db.js', () => ({
	get db() {
		return holder.db
	},
}))

vi.mock('../../lib/storage.js', async (original) => ({
	...(await original<typeof import('../../lib/storage.js')>()),
	photoUrl: async (key: string) => `https://bucket.test/${key}`,
	listPhotos: async () => [...bucket].map(([key, modified]) => ({ key, modified })),
	photoExists: async (key: string) => {
		reached.add('exists')

		await gates.exists

		return bucket.has(key)
	},
	deletePhotos: async (keys: string[]) => {
		reached.add('delete')

		await gates.delete

		for (const key of keys) bucket.delete(key)

		return []
	},
}))

import { createDb, migrate, sql } from 'saga'
import { sweepPhotos } from '../../handlers/photo-sweep.js'
import { addPlace, listPlaces, updatePlace } from '../../handlers/places.js'
import type { PlaceDraft } from '../../lib/schemas.js'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

const USER = '00000000-0000-4000-8000-000000000001'

const OLD = `users/${USER}/old.jpg`

const draft: PlaceDraft = {
	name: 'Cafe',
	category: 'food',
	address: '1 Main St',
	latitude: 40,
	longitude: -80,
	visits: [{ visitedAt: '2026-09-27', rating: 4, photos: [] }],
}

const withPhotos = (photos: string[]): PlaceDraft => ({
	...draft,
	visits: [{ visitedAt: '2026-09-27', rating: 4, photos }],
})

/** A gate, and the function that opens it. */
function gate(): [Promise<void>, () => void] {
	let open = () => {}

	const promise = new Promise<void>((resolve) => {
		open = resolve
	})

	return [promise, open]
}

/** Waits until a storage call has started, inside its transaction. */
async function until(call: 'delete' | 'exists'): Promise<void> {
	await vi.waitFor(() => {
		expect(reached.has(call)).toBe(true)
	})
}

/** Waits until some transaction waits on an advisory lock. */
async function untilBlocked(): Promise<void> {
	await vi.waitFor(async () => {
		const row = await holder.db?.first<{ waiting: number }>(
			sql`SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`,
		)

		expect(row?.waiting).toBeGreaterThan(0)
	})
}

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('photo sweep and saves', () => {
	let stop: () => Promise<unknown>

	beforeAll(async () => {
		const container = await startPostgres()

		await migrate({ url: container.connectionUri }, migrationsDir)

		holder.db = createDb(() => ({ url: container.connectionUri, max: 10 }))

		stop = () => container.stop()
	}, 60_000)

	afterAll(async () => {
		await holder.db?.close()

		await stop?.()
	})

	beforeEach(async () => {
		await holder.db?.exec(sql`DELETE FROM documents`)

		bucket.clear()

		bucket.set(OLD, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000))

		gates.delete = undefined

		gates.exists = undefined

		reached.clear()
	})

	it('save first: the sweep waits, then finds the key held and keeps it', async () => {
		const place = await addPlace(USER, draft)

		const [exists, openExists] = gate()

		gates.exists = exists

		const saving = updatePlace(USER, place?.id ?? '', withPhotos([OLD]))

		await until('exists')

		const sweeping = sweepPhotos({ deletes: true })

		await untilBlocked()

		openExists()

		await saving

		expect(await sweeping).toMatchObject({ kept: 1, deleted: 0 })

		expect(bucket.has(OLD)).toBe(true)
	})

	it('sweep first: the save waits, then is refused with photo-missing', async () => {
		const place = await addPlace(USER, draft)

		const [deleting, openDelete] = gate()

		gates.delete = deleting

		const sweeping = sweepPhotos({ deletes: true })

		await until('delete')

		const saving = updatePlace(USER, place?.id ?? '', withPhotos([OLD]))

		await untilBlocked()

		openDelete()

		expect(await sweeping).toMatchObject({ deleted: 1 })

		await expect(saving).rejects.toMatchObject({ status: 409, code: 'photo-missing' })

		expect((await listPlaces(USER))[0]?.visits[0]?.photos).toEqual([])
	})
})
