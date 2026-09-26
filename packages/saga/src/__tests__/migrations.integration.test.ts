import { createHash } from 'node:crypto'
import { isDockerAvailable, startPostgres, type TestDatabase } from 'vali/containers'
import { createTempDir } from 'vali/fixtures'
import { createDb, type Db } from '../db.js'
import { MigrationError, migrate, migrationStatus } from '../migrations.js'
import { sql } from '../sql.js'

let testDb: TestDatabase
let db: Db

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startPostgres()

	db = createDb(() => ({ url: testDb.connectionUri }))
}, 60_000)

afterAll(async () => {
	await db?.close()

	await testDb?.stop()
})

function tableExists(name: string): Promise<boolean> {
	return db.val<boolean>(sql`SELECT to_regclass(${name}) IS NOT NULL`)
}

function recorded(): Promise<{ name: string; checksum: string | null }[]> {
	return db.many(sql`
		SELECT name, checksum
		FROM saga.migrations
		ORDER BY name
	`)
}

function sha256(content: string): string {
	return createHash('sha256').update(content).digest('hex')
}

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('migrations (integration)', () => {
	let tmp: Awaited<ReturnType<typeof createTempDir>>
	let connection: { url: string }

	beforeEach(async () => {
		await db.exec(sql`DROP SCHEMA IF EXISTS saga CASCADE`)

		await db.exec(sql`DROP SCHEMA public CASCADE`)

		await db.exec(sql`CREATE SCHEMA public`)

		tmp = await createTempDir('saga-migrations-')

		connection = { url: testDb.connectionUri }
	})

	afterEach(async () => {
		await tmp.cleanup()
	})

	describe('migrate', () => {
		it('applies the files in order and records each name and checksum', async () => {
			const first = 'CREATE TABLE widgets (id SERIAL PRIMARY KEY)'

			const second = 'ALTER TABLE widgets ADD COLUMN name TEXT'

			await tmp.writeFile('0002_add_name.sql', second)

			await tmp.writeFile('0001_create_widgets.sql', first)

			const applied = await migrate(connection, tmp.path)

			expect(applied).toEqual(['0001_create_widgets.sql', '0002_add_name.sql'])

			expect(await recorded()).toEqual([
				{ name: '0001_create_widgets.sql', checksum: sha256(first) },
				{ name: '0002_add_name.sql', checksum: sha256(second) },
			])

			expect(await db.exec(sql`INSERT INTO widgets (name) VALUES (${'bolt'})`)).toBe(1)
		})

		it('applies nothing on a second run', async () => {
			await tmp.writeFile('0001_create_widgets.sql', 'CREATE TABLE widgets (id INT)')

			await migrate(connection, tmp.path)

			const applied = await migrate(connection, tmp.path)

			expect(applied).toEqual([])
		})

		it('applies only the files added since the last run', async () => {
			await tmp.writeFile('0001_create_widgets.sql', 'CREATE TABLE widgets (id INT)')

			await migrate(connection, tmp.path)

			await tmp.writeFile('0002_add_name.sql', 'ALTER TABLE widgets ADD COLUMN name TEXT')

			const applied = await migrate(connection, tmp.path)

			expect(applied).toEqual(['0002_add_name.sql'])
		})

		it('rolls back a failing migration, leaves it unrecorded and throws naming the file', async () => {
			await tmp.writeFile('0001_create_widgets.sql', 'CREATE TABLE widgets (id INT)')

			await tmp.writeFile(
				'0002_broken.sql',
				'CREATE TABLE gadgets (id INT); SELECT * FROM no_such_table',
			)

			const result = migrate(connection, tmp.path)

			await expect(result).rejects.toThrow(MigrationError)

			await expect(result).rejects.toThrow('0002_broken.sql failed')

			expect(await tableExists('gadgets')).toBe(false)

			expect((await recorded()).map((m) => m.name)).toEqual(['0001_create_widgets.sql'])
		})

		it('refuses to apply anything while an applied file has been edited', async () => {
			await tmp.writeFile('0001_create_widgets.sql', 'CREATE TABLE widgets (id INT)')

			await migrate(connection, tmp.path)

			await tmp.writeFile('0001_create_widgets.sql', 'CREATE TABLE widgets (id BIGINT)')

			await tmp.writeFile('0002_create_gadgets.sql', 'CREATE TABLE gadgets (id INT)')

			const result = migrate(connection, tmp.path)

			await expect(result).rejects.toThrow(MigrationError)

			await expect(result).rejects.toThrow(
				'Applied migrations were edited: 0001_create_widgets.sql',
			)

			expect(await tableExists('gadgets')).toBe(false)

			expect((await recorded()).map((m) => m.name)).toEqual(['0001_create_widgets.sql'])
		})

		it('fills in the checksum of a row recorded before checksums existed', async () => {
			const content = 'CREATE TABLE widgets (id INT)'

			await tmp.writeFile('0001_create_widgets.sql', content)

			await db.exec(sql`CREATE SCHEMA saga`)

			await db.exec(sql`
				CREATE TABLE saga.migrations (
					id SERIAL PRIMARY KEY,
					name TEXT NOT NULL UNIQUE,
					applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
				)
			`)

			await db.exec(sql`INSERT INTO saga.migrations (name) VALUES (${'0001_create_widgets.sql'})`)

			const applied = await migrate(connection, tmp.path)

			expect(applied).toEqual([])

			expect(await recorded()).toEqual([
				{ name: '0001_create_widgets.sql', checksum: sha256(content) },
			])
		})

		it('applies each file once when two runs start at the same time', async () => {
			await tmp.writeFile('0001_create_widgets.sql', 'CREATE TABLE widgets (id SERIAL PRIMARY KEY)')

			await tmp.writeFile('0002_add_name.sql', 'ALTER TABLE widgets ADD COLUMN name TEXT')

			const [a, b] = await Promise.all([
				migrate(connection, tmp.path),
				migrate(connection, tmp.path),
			])

			expect([...a, ...b].sort()).toEqual(['0001_create_widgets.sql', '0002_add_name.sql'])

			expect((await recorded()).map((m) => m.name)).toEqual([
				'0001_create_widgets.sql',
				'0002_add_name.sql',
			])
		})
	})

	describe('migrationStatus', () => {
		it('reports every file as pending in a database without the saga schema', async () => {
			await tmp.writeFile('0001_create_widgets.sql', 'CREATE TABLE widgets (id INT)')

			await tmp.writeFile('0002_add_name.sql', 'ALTER TABLE widgets ADD COLUMN name TEXT')

			const statuses = await migrationStatus(connection, tmp.path)

			expect(statuses).toEqual([
				{ name: '0001_create_widgets.sql', state: 'pending' },
				{ name: '0002_add_name.sql', state: 'pending' },
			])

			expect(await tableExists('saga.migrations')).toBe(false)
		})

		it('reports applied and pending files after a run', async () => {
			await tmp.writeFile('0001_create_widgets.sql', 'CREATE TABLE widgets (id INT)')

			await migrate(connection, tmp.path)

			await tmp.writeFile('0002_add_name.sql', 'ALTER TABLE widgets ADD COLUMN name TEXT')

			const statuses = await migrationStatus(connection, tmp.path)

			expect(statuses).toEqual([
				{ name: '0001_create_widgets.sql', state: 'applied' },
				{ name: '0002_add_name.sql', state: 'pending' },
			])
		})
	})
})
