import { sql } from 'saga'
import { db } from './db.js'

// Admins are made and unmade by the operator from the command line, never through
// the API, so a compromised admin can't make more admins.

/**
 * Makes the user an admin. The user must already have a passkey, because admins
 * sign in only with one. Their sessions end, since each began with a password.
 */
export function promote(email: string): Promise<'promoted' | 'not_found' | 'no_passkey'> {
	return db.tx(async (tx) => {
		const user = await tx.first<{ id: string }>(
			sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()} FOR UPDATE`,
		)

		if (!user) return 'not_found'

		const hasPasskey = await tx.val<boolean>(
			sql`SELECT EXISTS (SELECT 1 FROM passkeys WHERE user_id = ${user.id})`,
		)

		if (!hasPasskey) return 'no_passkey'

		await tx.exec(sql`UPDATE users SET role = 'admin' WHERE id = ${user.id}`)

		await tx.exec(sql`DELETE FROM sessions WHERE user_id = ${user.id}`)

		return 'promoted'
	})
}

/** Makes the admin a user again. */
export async function demote(email: string): Promise<'demoted' | 'not_found'> {
	const updated = await db.exec(
		sql`UPDATE users SET role = 'user' WHERE email = ${email.trim().toLowerCase()}`,
	)

	return updated ? 'demoted' : 'not_found'
}
