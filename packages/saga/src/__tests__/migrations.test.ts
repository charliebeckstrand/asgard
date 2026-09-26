import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempDir } from 'vali/fixtures'
import {
	compare,
	createMigration,
	type Migration,
	MigrationError,
	readMigrations,
} from '../migrations.js'

let tmp: Awaited<ReturnType<typeof createTempDir>>

beforeEach(async () => {
	tmp = await createTempDir('saga-migrations-')
})

afterEach(async () => {
	await tmp.cleanup()
})

function file(name: string, checksum = `sum-${name}`): Migration {
	return { name, checksum, sql: '' }
}

describe('readMigrations', () => {
	it('returns the migration files sorted by name', async () => {
		await tmp.writeFile('0003_third.sql', 'SELECT 3')

		await tmp.writeFile('0001_first.sql', 'SELECT 1')

		await tmp.writeFile('0002_second.sql', 'SELECT 2')

		const migrations = await readMigrations(tmp.path)

		expect(migrations.map((m) => m.name)).toEqual([
			'0001_first.sql',
			'0002_second.sql',
			'0003_third.sql',
		])

		expect(migrations[0].sql).toBe('SELECT 1')
	})

	it('returns nothing for an empty directory', async () => {
		const migrations = await readMigrations(tmp.path)

		expect(migrations).toEqual([])
	})

	it('ignores files that are not .sql', async () => {
		await tmp.writeFile('0001_create_users.sql', 'CREATE TABLE users (id INT)')

		await tmp.writeFile('README.md', '# Migrations')

		await tmp.writeFile('notes.txt', 'some notes')

		const migrations = await readMigrations(tmp.path)

		expect(migrations.map((m) => m.name)).toEqual(['0001_create_users.sql'])
	})

	it.each([
		'1_x.sql',
		'0001_Bad.sql',
		'0001-dash.sql',
		'create_users.sql',
	])('rejects the misnamed file %s', async (name) => {
		await tmp.writeFile(name, 'SELECT 1')

		const result = readMigrations(tmp.path)

		await expect(result).rejects.toThrow(MigrationError)

		await expect(result).rejects.toThrow(`${name} must be named NNNN_name.sql in lowercase`)
	})

	it('rejects two files that share a number', async () => {
		await tmp.writeFile('0001_a.sql', 'SELECT 1')

		await tmp.writeFile('0001_b.sql', 'SELECT 2')

		const result = readMigrations(tmp.path)

		await expect(result).rejects.toThrow(MigrationError)

		await expect(result).rejects.toThrow('0001_a.sql and 0001_b.sql share the number 0001')
	})

	it('checksums each file as the sha256 hex of its content', async () => {
		const content = 'CREATE TABLE users (id INT)'

		await tmp.writeFile('0001_create_users.sql', content)

		const [migration] = await readMigrations(tmp.path)

		expect(migration.checksum).toBe(createHash('sha256').update(content).digest('hex'))
	})
})

describe('compare', () => {
	it('marks files the database has not recorded as pending', () => {
		const statuses = compare([file('0001_a.sql')], [])

		expect(statuses).toEqual([{ name: '0001_a.sql', state: 'pending' }])
	})

	it('marks recorded files with a matching checksum as applied', () => {
		const statuses = compare([file('0001_a.sql', 'abc')], [{ name: '0001_a.sql', checksum: 'abc' }])

		expect(statuses).toEqual([{ name: '0001_a.sql', state: 'applied' }])
	})

	it('marks recorded files whose checksum differs as changed', () => {
		const statuses = compare([file('0001_a.sql', 'new')], [{ name: '0001_a.sql', checksum: 'old' }])

		expect(statuses).toEqual([{ name: '0001_a.sql', state: 'changed' }])
	})

	it('marks recorded migrations without a file as missing', () => {
		const statuses = compare([], [{ name: '0001_a.sql', checksum: 'abc' }])

		expect(statuses).toEqual([{ name: '0001_a.sql', state: 'missing' }])
	})

	it('treats a row recorded without a checksum as applied', () => {
		const statuses = compare([file('0001_a.sql')], [{ name: '0001_a.sql', checksum: null }])

		expect(statuses).toEqual([{ name: '0001_a.sql', state: 'applied' }])
	})

	it('sorts the output by name', () => {
		const statuses = compare(
			[file('0003_c.sql'), file('0001_a.sql', 'abc')],
			[
				{ name: '0002_b.sql', checksum: 'def' },
				{ name: '0001_a.sql', checksum: 'abc' },
			],
		)

		expect(statuses).toEqual([
			{ name: '0001_a.sql', state: 'applied' },
			{ name: '0002_b.sql', state: 'missing' },
			{ name: '0003_c.sql', state: 'pending' },
		])
	})
})

describe('createMigration', () => {
	it('numbers the new file after the last one and leaves it empty', async () => {
		await tmp.writeFile('0001_first.sql', 'SELECT 1')

		await tmp.writeFile('0007_seventh.sql', 'SELECT 7')

		const name = await createMigration(tmp.path, 'next')

		expect(name).toBe('0008_next.sql')

		expect(await readFile(join(tmp.path, name), 'utf-8')).toBe('')
	})

	it('starts at 0001 in an empty directory', async () => {
		const name = await createMigration(tmp.path, 'init')

		expect(name).toBe('0001_init.sql')

		expect(await readdir(tmp.path)).toEqual(['0001_init.sql'])
	})

	it('slugifies the description', async () => {
		const name = await createMigration(tmp.path, '  Add user names! ')

		expect(name).toBe('0001_add_user_names.sql')
	})

	it.each(['', '   ', '!!!'])('rejects the empty name %j', async (description) => {
		const result = createMigration(tmp.path, description)

		await expect(result).rejects.toThrow(MigrationError)

		expect(await readdir(tmp.path)).toEqual([])
	})
})
