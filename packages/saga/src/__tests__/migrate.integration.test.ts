import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Pool } from 'pg'
import { isDockerAvailable, startPostgres, type TestDatabase } from 'vali/containers'
import { createTempDir } from 'vali/fixtures'
import { createDatabaseClient } from '../db.js'
import { runMigrations } from '../migrate.js'

let testDb: TestDatabase
let pool: Pool

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startPostgres()

	pool = new Pool({ connectionString: testDb.connectionUri })
}, 30_000)

afterAll(async () => {
	await pool?.end()

	await testDb?.stop()
})

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('runMigrations (integration)', () => {
	beforeEach(async () => {
		await pool.query('DROP SCHEMA IF EXISTS saga CASCADE')
	})

	it('applies all migrations against a real database', async () => {
		const tmp = await createTempDir('saga-migrate-')

		await writeFile(
			join(tmp.path, '0001_create_test_table.sql'),
			'CREATE TABLE test_migration (id SERIAL PRIMARY KEY, name TEXT NOT NULL)',
		)

		await writeFile(
			join(tmp.path, '0002_add_email.sql'),
			'ALTER TABLE test_migration ADD COLUMN email TEXT',
		)

		const db = createDatabaseClient(pool)

		const result = await runMigrations(db, tmp.path)

		expect(result.applied).toEqual(['0001_create_test_table.sql', '0002_add_email.sql'])

		expect(result.skipped).toEqual([])

		// Verify the table actually exists with both columns
		const { rows } = await pool.query(`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_name = 'test_migration'
			ORDER BY ordinal_position
		`)

		const columns = rows.map((r: { column_name: string }) => r.column_name)

		expect(columns).toContain('id')
		expect(columns).toContain('name')
		expect(columns).toContain('email')

		await tmp.cleanup()
	})

	it('skips already-applied migrations', async () => {
		const tmp = await createTempDir('saga-migrate-')

		await writeFile(
			join(tmp.path, '0001_create_users.sql'),
			'CREATE TABLE skip_test (id SERIAL PRIMARY KEY)',
		)

		await writeFile(
			join(tmp.path, '0002_add_email.sql'),
			'ALTER TABLE skip_test ADD COLUMN email TEXT',
		)

		const db = createDatabaseClient(pool)

		// First run — apply all
		await runMigrations(db, tmp.path)

		// Second run — should skip both
		const result = await runMigrations(db, tmp.path)

		expect(result.applied).toEqual([])

		expect(result.skipped).toEqual(['0001_create_users.sql', '0002_add_email.sql'])

		await tmp.cleanup()
	})

	it('applies only new migrations on subsequent runs', async () => {
		const tmp = await createTempDir('saga-migrate-')

		await writeFile(
			join(tmp.path, '0001_initial.sql'),
			'CREATE TABLE incremental_test (id SERIAL PRIMARY KEY)',
		)

		const db = createDatabaseClient(pool)

		await runMigrations(db, tmp.path)

		// Add a new migration
		await writeFile(
			join(tmp.path, '0002_add_col.sql'),
			'ALTER TABLE incremental_test ADD COLUMN val TEXT',
		)

		const result = await runMigrations(db, tmp.path)

		expect(result.applied).toEqual(['0002_add_col.sql'])
		expect(result.skipped).toEqual(['0001_initial.sql'])

		await tmp.cleanup()
	})

	it('records migrations in the saga.migrations table', async () => {
		const tmp = await createTempDir('saga-migrate-')

		await writeFile(join(tmp.path, '0001_tracked.sql'), 'CREATE TABLE tracking_test (id INT)')

		const db = createDatabaseClient(pool)

		await runMigrations(db, tmp.path)

		const { rows } = await pool.query('SELECT name FROM saga.migrations ORDER BY name')

		expect(rows).toEqual([{ name: '0001_tracked.sql' }])

		await tmp.cleanup()
	})

	it('serializes concurrent runMigrations calls so neither errors', async () => {
		const tmp = await createTempDir('saga-migrate-')

		await writeFile(
			join(tmp.path, '0001_concurrent.sql'),
			'CREATE TABLE concurrent_test (id SERIAL PRIMARY KEY)',
		)

		await writeFile(
			join(tmp.path, '0002_concurrent.sql'),
			'ALTER TABLE concurrent_test ADD COLUMN val TEXT',
		)

		// Two independent pools simulate two service replicas booting at once.
		const poolA = new Pool({ connectionString: testDb.connectionUri })
		const poolB = new Pool({ connectionString: testDb.connectionUri })

		try {
			const [resA, resB] = await Promise.all([
				runMigrations(createDatabaseClient(poolA), tmp.path),
				runMigrations(createDatabaseClient(poolB), tmp.path),
			])

			// Each migration applied exactly once across both runs.
			const appliedAcross = [...resA.applied, ...resB.applied].sort()

			expect(appliedAcross).toEqual(['0001_concurrent.sql', '0002_concurrent.sql'])

			const { rows } = await pool.query('SELECT name FROM saga.migrations ORDER BY name')

			expect(rows).toEqual([{ name: '0001_concurrent.sql' }, { name: '0002_concurrent.sql' }])
		} finally {
			await poolA.end()
			await poolB.end()
		}

		await tmp.cleanup()
	})
})
