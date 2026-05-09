import { Client } from 'pg'
import { isDockerAvailable, startPostgres, type TestDatabase } from 'vali/containers'
import { bootstrapDatabases } from '../bootstrap.js'

let testDb: TestDatabase

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startPostgres()
}, 30_000)

afterAll(async () => {
	await testDb?.stop()
})

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('bootstrapDatabases (integration)', () => {
	it('creates roles and databases declared in the spec', async () => {
		const result = await bootstrapDatabases(testDb.connectionUri, [
			{ name: 'alpha_db', role: 'alpha_role', password: 'alpha_pw' },
			{ name: 'beta_db', role: 'beta_role', password: 'beta_pw' },
		])

		expect(result.createdRoles.sort()).toEqual(['alpha_role', 'beta_role'])
		expect(result.createdDatabases.sort()).toEqual(['alpha_db', 'beta_db'])

		const admin = new Client({ connectionString: testDb.connectionUri })

		await admin.connect()

		const roles = await admin.query(
			"SELECT rolname FROM pg_roles WHERE rolname IN ('alpha_role', 'beta_role') ORDER BY rolname",
		)
		const dbs = await admin.query(
			"SELECT datname FROM pg_database WHERE datname IN ('alpha_db', 'beta_db') ORDER BY datname",
		)

		expect(roles.rows.map((r) => r.rolname)).toEqual(['alpha_role', 'beta_role'])
		expect(dbs.rows.map((r) => r.datname)).toEqual(['alpha_db', 'beta_db'])

		await admin.end()
	})

	it('is idempotent when run twice with the same spec', async () => {
		const spec = [{ name: 'gamma_db', role: 'gamma_role', password: 'gamma_pw' }]

		await bootstrapDatabases(testDb.connectionUri, spec)

		const second = await bootstrapDatabases(testDb.connectionUri, spec)

		expect(second.createdRoles).toEqual([])
		expect(second.createdDatabases).toEqual([])
	})

	it('lets the new role connect to its database', async () => {
		await bootstrapDatabases(testDb.connectionUri, [
			{ name: 'delta_db', role: 'delta_role', password: 'delta_pw' },
		])

		const url = new URL(testDb.connectionUri)

		url.username = 'delta_role'
		url.password = 'delta_pw'
		url.pathname = '/delta_db'

		const client = new Client({ connectionString: url.toString() })

		await client.connect()

		const result = await client.query('SELECT current_database() AS db, current_user AS usr')

		expect(result.rows[0]).toEqual({ db: 'delta_db', usr: 'delta_role' })

		await client.end()
	})
})
