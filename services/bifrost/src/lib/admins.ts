import { sql } from 'saga'
import { normalizeEmail } from 'skuld'
import { db } from './db.js'
import { countSecondFactors } from './mfa-repository.js'

// Admins are made and unmade by the operator from the command line, never through
// the API, so a compromised admin can't make more admins.

/**
 * Makes the user an admin. The user must have verified their email, so the
 * account is theirs and not one someone made with their address first. They
 * must also have a passkey or an authenticator app, because admins sign in with
 * two steps. Their sessions end, since each may have begun with one step.
 */
export function promote(
	email: string,
): Promise<'promoted' | 'not_found' | 'unverified' | 'no_second_factor'> {
	return db.tx(async (tx) => {
		const user = await tx.first<{ id: string; is_verified: boolean }>(
			sql`SELECT id, is_verified FROM users WHERE email = ${normalizeEmail(email)} FOR UPDATE`,
		)

		if (!user) return 'not_found'

		if (!user.is_verified) return 'unverified'

		if ((await countSecondFactors(tx, user.id)) === 0) return 'no_second_factor'

		await tx.exec(sql`
				UPDATE users SET roles = array_append(roles, 'admin')
				WHERE id = ${user.id} AND NOT 'admin' = ANY(roles)
			`)

		await tx.exec(sql`DELETE FROM sessions WHERE user_id = ${user.id}`)

		return 'promoted'
	})
}

/** Takes the admin role away. The user keeps their other roles. */
export async function demote(email: string): Promise<'demoted' | 'not_found'> {
	const updated = await db.exec(
		sql`
			UPDATE users SET roles = array_remove(roles, 'admin')
			WHERE email = ${normalizeEmail(email)}
		`,
	)

	return updated ? 'demoted' : 'not_found'
}

/**
 * Removes every second factor of the user, for one who lost them all, and ends
 * their sessions and pending sign-ins. They then sign in with the password
 * alone. An admin keeps the role, but the admin routes stay closed until they
 * add a new factor.
 */
export function resetSecondFactors(email: string): Promise<'reset' | 'not_found'> {
	return db.tx(async (tx) => {
		const user = await tx.first<{ id: string }>(
			sql`SELECT id FROM users WHERE email = ${normalizeEmail(email)} FOR UPDATE`,
		)

		if (!user) return 'not_found'

		await tx.exec(sql`DELETE FROM passkeys WHERE user_id = ${user.id}`)

		await tx.exec(sql`DELETE FROM totp_secrets WHERE user_id = ${user.id}`)

		await tx.exec(sql`DELETE FROM recovery_codes WHERE user_id = ${user.id}`)

		await tx.exec(sql`DELETE FROM sessions WHERE user_id = ${user.id}`)

		return 'reset'
	})
}
