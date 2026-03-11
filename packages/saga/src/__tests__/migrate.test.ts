import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Db, Queryable } from '../db.js'
import { getMigrationStatus, runMigrations } from '../migrate.js'

function createMockDb(state: { appliedMigrations: string[] }) {
	const execCalls: string[] = []

	const mockTx: Queryable = {
		query: vi.fn(),
		get: vi.fn(),
		many: vi.fn(),
		val: vi.fn(),

		async exec(fragment) {
			execCalls.push(fragment.text)

			return 0
		},
	}

	const db: Db = {
		pool: {} as Db['pool'],

		async query() {
			return null
		},

		async get(_fragment) {
			throw new Error('Unexpected get call')
		},

		async many() {
			return state.appliedMigrations.map((name) => ({
				name,
				applied_at: '2026-01-01T00:00:00Z',
			}))
		},

		async exec(fragment) {
			execCalls.push(fragment.text)

			return 0
		},

		async val() {
			return 0 as never
		},

		async tx(fn) {
			const result = await fn(mockTx)

			return result
		},
	}

	return { db, execCalls }
}

let migrationsDir: string

beforeEach(async () => {
	migrationsDir = await mkdtemp(join(tmpdir(), 'saga-migrate-'))
})

afterEach(async () => {
	await rm(migrationsDir, { recursive: true })
})

describe('runMigrations', () => {
	it('applies all migrations when none have been applied', async () => {
		await writeFile(join(migrationsDir, '0001_create_users.sql'), 'CREATE TABLE users (id INT)')
		await writeFile(join(migrationsDir, '0002_add_email.sql'), 'ALTER TABLE users ADD email TEXT')

		const { db } = createMockDb({ appliedMigrations: [] })

		const result = await runMigrations(db, migrationsDir)

		expect(result.applied).toEqual(['0001_create_users.sql', '0002_add_email.sql'])

		expect(result.skipped).toEqual([])
	})

	it('skips already-applied migrations', async () => {
		await writeFile(join(migrationsDir, '0001_create_users.sql'), 'CREATE TABLE users (id INT)')
		await writeFile(join(migrationsDir, '0002_add_email.sql'), 'ALTER TABLE users ADD email TEXT')

		const { db } = createMockDb({ appliedMigrations: ['0001_create_users.sql'] })

		const result = await runMigrations(db, migrationsDir)

		expect(result.applied).toEqual(['0002_add_email.sql'])

		expect(result.skipped).toEqual(['0001_create_users.sql'])
	})

	it('skips all when everything is applied', async () => {
		await writeFile(join(migrationsDir, '0001_create_users.sql'), 'CREATE TABLE users (id INT)')

		const { db } = createMockDb({ appliedMigrations: ['0001_create_users.sql'] })

		const result = await runMigrations(db, migrationsDir)

		expect(result.applied).toEqual([])

		expect(result.skipped).toEqual(['0001_create_users.sql'])
	})

	it('returns empty result when no migration files exist', async () => {
		const { db } = createMockDb({ appliedMigrations: [] })

		const result = await runMigrations(db, migrationsDir)

		expect(result.applied).toEqual([])

		expect(result.skipped).toEqual([])
	})

	it('ignores non-sql files', async () => {
		await writeFile(join(migrationsDir, '0001_create_users.sql'), 'CREATE TABLE users (id INT)')
		await writeFile(join(migrationsDir, 'README.md'), '# Migrations')
		await writeFile(join(migrationsDir, 'notes.txt'), 'some notes')

		const { db } = createMockDb({ appliedMigrations: [] })

		const result = await runMigrations(db, migrationsDir)

		expect(result.applied).toEqual(['0001_create_users.sql'])
	})

	it('applies migrations in sorted filename order', async () => {
		await writeFile(join(migrationsDir, '0003_third.sql'), 'SELECT 3')
		await writeFile(join(migrationsDir, '0001_first.sql'), 'SELECT 1')
		await writeFile(join(migrationsDir, '0002_second.sql'), 'SELECT 2')

		const { db } = createMockDb({ appliedMigrations: [] })

		const result = await runMigrations(db, migrationsDir)

		expect(result.applied).toEqual(['0001_first.sql', '0002_second.sql', '0003_third.sql'])
	})

	it('creates saga schema and migrations table', async () => {
		const { db, execCalls } = createMockDb({ appliedMigrations: [] })

		await runMigrations(db, migrationsDir)

		expect(execCalls[0]).toContain('CREATE SCHEMA IF NOT EXISTS saga')

		expect(execCalls[1]).toContain('CREATE TABLE IF NOT EXISTS saga.migrations')
	})

	it('runs each migration inside a transaction', async () => {
		await writeFile(join(migrationsDir, '0001_test.sql'), 'CREATE TABLE test (id INT)')

		const txCalls: string[] = []

		const { db } = createMockDb({ appliedMigrations: [] })

		const originalTx = db.tx.bind(db)

		db.tx = async (fn) => {
			txCalls.push('tx:start')

			const result = await originalTx(fn)

			txCalls.push('tx:end')

			return result
		}

		await runMigrations(db, migrationsDir)

		expect(txCalls).toEqual(['tx:start', 'tx:end'])
	})
})

describe('getMigrationStatus', () => {
	it('returns applied and pending migrations', async () => {
		await writeFile(join(migrationsDir, '0001_create_users.sql'), 'CREATE TABLE users (id INT)')
		await writeFile(join(migrationsDir, '0002_add_email.sql'), 'ALTER TABLE users ADD email TEXT')
		await writeFile(join(migrationsDir, '0003_add_name.sql'), 'ALTER TABLE users ADD name TEXT')

		const { db } = createMockDb({ appliedMigrations: ['0001_create_users.sql'] })

		const status = await getMigrationStatus(db, migrationsDir)

		expect(status.applied).toEqual([
			{ name: '0001_create_users.sql', applied_at: '2026-01-01T00:00:00Z' },
		])

		expect(status.pending).toEqual(['0002_add_email.sql', '0003_add_name.sql'])
	})

	it('shows all as pending when none applied', async () => {
		await writeFile(join(migrationsDir, '0001_test.sql'), 'SELECT 1')

		const { db } = createMockDb({ appliedMigrations: [] })

		const status = await getMigrationStatus(db, migrationsDir)

		expect(status.applied).toEqual([])

		expect(status.pending).toEqual(['0001_test.sql'])
	})

	it('shows none pending when all applied', async () => {
		await writeFile(join(migrationsDir, '0001_test.sql'), 'SELECT 1')

		const { db } = createMockDb({ appliedMigrations: ['0001_test.sql'] })

		const status = await getMigrationStatus(db, migrationsDir)

		expect(status.applied).toEqual([{ name: '0001_test.sql', applied_at: '2026-01-01T00:00:00Z' }])

		expect(status.pending).toEqual([])
	})
})
