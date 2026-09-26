import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createMigration, MigrationError, migrate, migrationStatus } from '../migrations.js'

const usage = `Usage: saga <command> [options]

Commands:
  migrate       Apply pending migrations
  status        List migrations and whether each is applied
  new <name>    Create the next numbered migration

Options:
  --dir <path>        Migrations directory (default: ./migrations)
  --env-file <path>   Load environment variables from a file first

migrate and status connect with DATABASE_URL, and verify the server with
DATABASE_CA_CERT when it is set.`

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		dir: { type: 'string', default: 'migrations' },
		'env-file': { type: 'string' },
	},
})

const [command, name] = positionals

const dir = resolve(values.dir)

if (values['env-file']) {
	process.loadEnvFile(values['env-file'])
}

function connection() {
	const url = process.env.DATABASE_URL

	if (!url) {
		throw new MigrationError('DATABASE_URL is not set')
	}

	return { url, ca: process.env.DATABASE_CA_CERT || undefined }
}

async function run(): Promise<void> {
	switch (command) {
		case 'migrate': {
			const applied = await migrate(connection(), dir)

			for (const file of applied) console.log(`applied ${file}`)

			if (applied.length === 0) console.log('no pending migrations')

			return
		}

		case 'status': {
			for (const { name, state } of await migrationStatus(connection(), dir)) {
				console.log(`${state.padEnd(8)} ${name}`)
			}

			return
		}

		case 'new': {
			console.log(`created ${await createMigration(dir, name ?? '')}`)

			return
		}

		default: {
			console.error(usage)

			process.exitCode = 1
		}
	}
}

try {
	await run()
} catch (err) {
	console.error(err instanceof Error ? err.message : err)

	process.exitCode = 1
}
