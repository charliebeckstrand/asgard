import { demote, promote, resetSecondFactors } from './lib/admins.js'
import { db } from './lib/db.js'

// Operator commands, run where DATABASE_URL is set:
//   node dist/cli.js promote <email>
//   node dist/cli.js demote <email>
//   node dist/cli.js reset-mfa <email>

const messages = {
	promoted: 'is now an admin. They sign in with two steps.',
	demoted: 'is no longer an admin.',
	reset:
		'has no second factors now and is signed out. An admin gets the admin pages back after adding one.',
	not_found: 'has no account.',
	no_second_factor:
		'has no passkey or authenticator app. They must add one before they can be an admin.',
} as const

const [command, email] = process.argv.slice(2)

const run = { promote, demote, 'reset-mfa': resetSecondFactors }[command ?? '']

if (!run || !email) {
	console.error('Usage: node dist/cli.js <promote|demote|reset-mfa> <email>')

	process.exit(1)
}

const result = await run(email)

console.log(`${email} ${messages[result]}`)

await db.close()

process.exit(result === 'not_found' || result === 'no_second_factor' ? 1 : 0)
