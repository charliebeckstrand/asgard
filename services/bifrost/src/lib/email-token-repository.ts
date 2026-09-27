import { sql } from 'saga'
import type { EmailTokenRepository } from '../auth/types.js'
import { db } from './db.js'

export function createEmailTokenRepository(): EmailTokenRepository {
	return {
		async createToken(id, userId, purpose, expiresAt, interval) {
			// Replaces the user's live link of this purpose, unless it is newer than `interval`.
			const created = await db.first(
				sql`
					INSERT INTO email_tokens (id, user_id, purpose, expires_at)
					VALUES (${id}, ${userId}, ${purpose}, ${expiresAt})
					ON CONFLICT (user_id, purpose) DO UPDATE
					SET id = EXCLUDED.id, created_at = now(), expires_at = EXCLUDED.expires_at
					WHERE email_tokens.created_at <= now() - make_interval(secs => ${interval})
					RETURNING id
				`,
			)

			return created !== null
		},

		async verifyEmail(id) {
			const verified = await db.exec(
				sql`
					WITH used AS (
						DELETE FROM email_tokens
						WHERE id = ${id} AND purpose = 'verify_email' AND expires_at > now()
						RETURNING user_id
					)
					UPDATE users SET is_verified = true
					WHERE id = (SELECT user_id FROM used)
				`,
			)

			return verified > 0
		},

		async resetPassword(id, hashedPassword) {
			return db.tx(async (tx) => {
				const used = await tx.first<{ user_id: string }>(
					sql`
						DELETE FROM email_tokens
						WHERE id = ${id} AND purpose = 'reset_password' AND expires_at > now()
						RETURNING user_id
					`,
				)

				if (!used) return false

				// The link reached the inbox, so the email is the user's.
				const user = await tx.one<{ email: string }>(
					sql`
						UPDATE users SET hashed_password = ${hashedPassword}, is_verified = true
						WHERE id = ${used.user_id}
						RETURNING email
					`,
				)

				// The wrong passwords before the reset no longer hold back a sign-in.
				await tx.exec(sql`DELETE FROM failed_logins WHERE email = ${user.email}`)

				await tx.exec(sql`DELETE FROM email_tokens WHERE user_id = ${used.user_id}`)

				await tx.exec(sql`DELETE FROM sessions WHERE user_id = ${used.user_id}`)

				return true
			})
		},

		async deleteExpiredTokens() {
			return db.exec(sql`DELETE FROM email_tokens WHERE expires_at <= now()`)
		},

		async countSentEmail(to, verified, limits) {
			return db.tx(async (tx) => {
				// Lets other writers wait, so two emails can't both take the last room.
				await tx.exec(sql`LOCK TABLE sent_emails IN EXCLUSIVE MODE`)

				const sent = await tx.one<{ total: number; unverified: number; recipient: number }>(
					sql`
						SELECT
							count(*)::int AS total,
							count(*) FILTER (WHERE NOT verified)::int AS unverified,
							count(*) FILTER (WHERE recipient = ${to})::int AS recipient
						FROM sent_emails
						WHERE sent_at > now() - interval '1 day'
					`,
				)

				if (
					sent.total >= limits.total ||
					sent.recipient >= limits.recipient ||
					(!verified && sent.unverified >= limits.unverified)
				) {
					return false
				}

				await tx.exec(
					sql`INSERT INTO sent_emails (recipient, verified) VALUES (${to}, ${verified})`,
				)

				return true
			})
		},

		async deleteOldSentEmails() {
			return db.exec(sql`DELETE FROM sent_emails WHERE sent_at <= now() - interval '1 day'`)
		},
	}
}
