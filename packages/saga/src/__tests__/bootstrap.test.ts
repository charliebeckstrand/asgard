import { bootstrapDatabases } from '../bootstrap.js'

describe('bootstrapDatabases', () => {
	it('rejects when postgres is unreachable within the connect timeout', async () => {
		const start = Date.now()

		// Port 1 is reserved/unbound — connection refuses immediately on most systems.
		await expect(
			bootstrapDatabases(
				'postgres://nobody:nobody@127.0.0.1:1/postgres',
				[{ name: 'x', role: 'x', password: 'x' }],
				{ connectTimeoutSeconds: 1 },
			),
		).rejects.toThrow(/Could not connect to postgres within 1s/)

		expect(Date.now() - start).toBeLessThan(5_000)
	})
})
