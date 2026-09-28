import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDockerAvailable, startPostgres } from 'vali/containers'
import { stubServiceEnv } from 'vali/env'

stubServiceEnv()

const { holder } = vi.hoisted(() => ({ holder: {} as { db?: import('saga').Db } }))

vi.mock('../../lib/db.js', () => ({
	get db() {
		return holder.db
	},
}))

import { createDb, migrate } from 'saga'
import { changeDocument, deleteDocuments, readDocument } from '../../handlers/documents.js'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

const USER = '00000000-0000-4000-8000-000000000001'

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('documents', () => {
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

	it('reads a document that does not exist as undefined', async () => {
		expect(await readDocument(USER, 'visits')).toBeUndefined()
	})

	it('writes a document and reads it back', async () => {
		await changeDocument(USER, 'places', () => ({ result: null, value: [{ id: 'a' }] }))

		expect(await readDocument(USER, 'places')).toEqual([{ id: 'a' }])
	})

	it('writes nothing when the change gives no value', async () => {
		await changeDocument(USER, 'visits', () => ({ result: null }))

		expect(await readDocument(USER, 'visits')).toBeUndefined()
	})

	it('runs changes to one document one at a time', async () => {
		const user = '00000000-0000-4000-8000-000000000002'

		const add = () =>
			changeDocument(user, 'places', (document) => ({
				result: null,
				value: [...((document as unknown[] | undefined) ?? []), { id: 'b' }],
			}))

		await Promise.all(Array.from({ length: 10 }, add))

		expect(await readDocument(user, 'places')).toHaveLength(10)
	})

	it("deletes every document of the user and no one else's", async () => {
		const other = '00000000-0000-4000-8000-000000000003'

		await changeDocument(USER, 'visits', () => ({ result: null, value: [] }))

		await changeDocument(other, 'places', () => ({ result: null, value: [] }))

		await deleteDocuments(USER)

		expect(await readDocument(USER, 'places')).toBeUndefined()

		expect(await readDocument(USER, 'visits')).toBeUndefined()

		expect(await readDocument(other, 'places')).toEqual([])
	})
})
