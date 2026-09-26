import { demote, promote } from './lib/admins.js'
import { db } from './lib/db.js'

// Operator commands, run where DATABASE_URL is set:
//   node dist/cli.js promote <email>
//   node dist/cli.js demote <email>

const messages = {
	promoted: 'is now an admin. They sign in with their passkey.',
	demoted: 'is no longer an admin.',
	not_found: 'has no account.',
	no_passkey: 'has no passkey. They must add one before they can be an admin.',
} as const

const [command, email] = process.argv.slice(2)

const run = { promote, demote }[command ?? '']

if (!run || !email) {
	console.error('Usage: node dist/cli.js <promote|demote> <email>')

	process.exit(1)
}

const result = await run(email)

console.log(`${email} ${messages[result]}`)

await db.close()

process.exit(result === 'promoted' || result === 'demoted' ? 0 : 1)
