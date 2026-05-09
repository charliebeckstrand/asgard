import { Client } from 'pg'

export interface DatabaseSpec {
	name: string
	role: string
	password: string
}

export interface BootstrapOptions {
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

	const message = lastError instanceof Error ? lastError.message : 'unknown error'

	throw new Error(`Could not connect to postgres within ${timeoutSeconds}s: ${message}`)
}

async function ensureRole(client: Client, spec: DatabaseSpec): Promise<boolean> {
	const result = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [spec.role])

	if (result.rowCount !== 0) return false

	const role = client.escapeIdentifier(spec.role)
	const password = client.escapeLiteral(spec.password)

	await client.query(`CREATE ROLE ${role} WITH LOGIN PASSWORD ${password}`)

	return true
}

async function ensureDatabase(client: Client, spec: DatabaseSpec): Promise<boolean> {
	const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [spec.name])

	if (result.rowCount !== 0) return false

	const name = client.escapeIdentifier(spec.name)
	const role = client.escapeIdentifier(spec.role)

	await client.query(`CREATE DATABASE ${name} OWNER ${role}`)

	return true
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
			if (await ensureRole(client, spec)) createdRoles.push(spec.role)
			if (await ensureDatabase(client, spec)) createdDatabases.push(spec.name)
		}
	} finally {
		await client.end()
	}

	return { createdRoles, createdDatabases }
}
