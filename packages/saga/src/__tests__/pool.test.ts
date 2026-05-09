import { Pool } from 'pg'
import { createPool } from '../pool.js'

vi.mock('pg', () => {
	const MockPool = vi.fn().mockImplementation(function (this: { on: unknown }) {
		this.on = vi.fn()
	})

	return { Pool: MockPool }
})

const MockedPool = vi.mocked(Pool)

describe('createPool', () => {
	beforeEach(() => {
		MockedPool.mockClear()
	})

	it('parses database URL into connection params', () => {
		createPool('postgres://myuser:mypass@dbhost:5433/mydb')

		expect(MockedPool).toHaveBeenCalledWith(
			expect.objectContaining({
				host: 'dbhost',
				port: 5433,
				database: 'mydb',
				user: 'myuser',
				password: 'mypass',
			}),
		)
	})

	it('defaults port to 5432 when not specified', () => {
		createPool('postgres://user:pass@host/db')

		expect(MockedPool).toHaveBeenCalledWith(
			expect.objectContaining({
				port: 5432,
			}),
		)
	})

	it('decodes URI-encoded username and password', () => {
		createPool('postgres://my%40user:p%40ss@host:5432/db')

		expect(MockedPool).toHaveBeenCalledWith(
			expect.objectContaining({
				user: 'my@user',
				password: 'p@ss',
			}),
		)
	})

	it('enables SSL when sslmode param is present', () => {
		createPool('postgres://user:pass@host:5432/db?sslmode=require')

		expect(MockedPool).toHaveBeenCalledWith(
			expect.objectContaining({
				ssl: { rejectUnauthorized: false },
			}),
		)
	})

	it('disables SSL when no sslmode param', () => {
		createPool('postgres://user:pass@host:5432/db')

		expect(MockedPool).toHaveBeenCalledWith(
			expect.objectContaining({
				ssl: false,
			}),
		)
	})

	it('disables SSL when sslmode=disable', () => {
		createPool('postgres://user:pass@host:5432/db?sslmode=disable')

		expect(MockedPool).toHaveBeenCalledWith(
			expect.objectContaining({
				ssl: false,
			}),
		)
	})

	it('uses default pool options', () => {
		createPool('postgres://user:pass@host:5432/db')

		expect(MockedPool).toHaveBeenCalledWith(
			expect.objectContaining({
				max: 5,
				idleTimeoutMillis: 30000,
				connectionTimeoutMillis: 5000,
			}),
		)
	})

	it('accepts custom pool options', () => {
		createPool('postgres://user:pass@host:5432/db', {
			max: 20,
			idleTimeoutMillis: 60000,
			connectionTimeoutMillis: 10000,
		})

		expect(MockedPool).toHaveBeenCalledWith(
			expect.objectContaining({
				max: 20,
				idleTimeoutMillis: 60000,
				connectionTimeoutMillis: 10000,
			}),
		)
	})

	it("attaches an 'error' listener so idle-client errors don't crash the process", () => {
		const pool = createPool('postgres://user:pass@host:5432/db')

		expect(pool.on).toHaveBeenCalledWith('error', expect.any(Function))
	})
})
