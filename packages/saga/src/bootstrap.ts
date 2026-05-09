import { Client } from 'pg'

export interface DatabaseSpec {
	name: string
	role: string
	password: string
}

export interface BootstrapOptions {
	/** Total seconds to wait for postgres to accept connections. Default: 30. */
	connectTimeoutSeconds?: number
}

export interface BootstrapResult {
	createdRoles: string[]
	createdDatabases: string[]
}

async function connectWithRetry(adminUrl: string, timeoutSeconds: number): Promise<Client> {
	const deadline = Date.now() + timeoutSeconds * 1000

	let lastError: unknown

	while (Date.now() < deadline) {
		const client = new Client({ connectionString: adminUrl })

		try {
			await client.connect()

			return client
		} catch (err) {
			lastError = err

			await client.end().catch(() => {})

			await new Promise((r) => setTimeout(r, 500))
		}
	}

	throw new Error(
		`Could not connect to postgres within ${timeoutSeconds}s: ${(lastError as Error)?.message ?? 'unknown error'}`,
	)
}

function quoteIdentifier(value: string): string {
	return `"${value.replace(/"/g, '""')}"`
}

function quoteLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`
}

export async function bootstrapDatabases(
	adminUrl: string,
	specs: DatabaseSpec[],
	options: BootstrapOptions = {},
): Promise<BootstrapResult> {
	const client = await connectWithRetry(adminUrl, options.connectTimeoutSeconds ?? 30)

	const createdRoles: string[] = []
	const createdDatabases: string[] = []

	try {
		for (const spec of specs) {
			const roleResult = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
				spec.role,
			])

			if (roleResult.rowCount === 0) {
				await client.query(
					`CREATE ROLE ${quoteIdentifier(spec.role)} WITH LOGIN PASSWORD ${quoteLiteral(spec.password)}`,
				)

				createdRoles.push(spec.role)
			}

			const dbResult = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
				spec.name,
			])

			if (dbResult.rowCount === 0) {
				await client.query(
					`CREATE DATABASE ${quoteIdentifier(spec.name)} OWNER ${quoteIdentifier(spec.role)}`,
				)

				createdDatabases.push(spec.name)
			}
		}
	} finally {
		await client.end()
	}

	return { createdRoles, createdDatabases }
}
