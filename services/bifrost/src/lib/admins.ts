import { sql } from 'saga'
import { db } from './db.js'
import { countSecondFactors } from './mfa-repository.js'

// Admins are made and unmade by the operator from the command line, never through
// the API, so a compromised admin can't make more admins.

/**
 * Makes the user an admin. The user must already have a passkey or an
 * authenticator app, because admins sign in with two steps. Their sessions end,
 * since each may have begun with one step.
 */
export function promote(email: string): Promise<'promoted' | 'not_found' | 'no_second_factor'> {
	return db.tx(async (tx) => {
		const user = await tx.first<{ id: string }>(
			sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()} FOR UPDATE`,
		)

		if (!user) return 'not_found'

		if ((await countSecondFactors(tx, user.id)) === 0) return 'no_second_factor'

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
