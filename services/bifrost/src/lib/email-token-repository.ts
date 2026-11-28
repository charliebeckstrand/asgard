import { type Db, type Queryable, sql } from 'saga'

export type EmailPurpose = 'verify_email' | 'reset_password'

/** The most emails that can go out in a day. */
export interface EmailLimits {
	/** To all addresses. */
	total: number
	/** To addresses no one has proven are theirs. */
	unverified: number
	/** To any one address. */
	recipient: number
}

/** Lets other writers wait, so two emails can't both take the last room. */
async function lockSentEmails(tx: Queryable): Promise<void> {
	await tx.exec(sql`LOCK TABLE sent_emails IN EXCLUSIVE MODE`)
}

/**
 * Counts an email to `to` as sent, unless it would pass one of `limits` for the
 * last day. Returns false, and counts nothing, when it would. Runs under
 * {@link lockSentEmails}.
 */
async function countSent(
	tx: Queryable,
	to: string,
	verified: boolean,
	limits: EmailLimits,
): Promise<boolean> {
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

	await tx.exec(sql`INSERT INTO sent_emails (recipient, verified) VALUES (${to}, ${verified})`)

	return true
}

export function createEmailTokenRepository(db: Db) {
	return {
		/**
		 * Stores a link for the user, replacing their live link of the same purpose,
		 * and counts the email that carries it against `limits`. Stores and counts
		 * nothing when that link is less than `interval` seconds old
		 * (`recently_sent`), or when the email would pass a limit (`over_budget`).
		 */
		async createToken(
			id: string,
			userId: string,
			purpose: EmailPurpose,
			expiresAt: Date,
			{
				interval,
				email,
				limits,
			}: { interval: number; email: { to: string; verified: boolean }; limits: EmailLimits },
		) {
			return db.tx(async (tx) => {
				// Taken before the checks, so two links can't both pass them.
				await lockSentEmails(tx)

				const recent = await tx.first(
					sql`
						SELECT 1 FROM email_tokens
						WHERE user_id = ${userId} AND purpose = ${purpose}
						AND created_at > now() - make_interval(secs => ${interval})
					`,
				)

				if (recent) return 'recently_sent' as const

				if (!(await countSent(tx, email.to, email.verified, limits))) return 'over_budget' as const

				// Replaces the user's live link of this purpose.
				await tx.exec(
					sql`
						INSERT INTO email_tokens (id, user_id, purpose, expires_at)
						VALUES (${id}, ${userId}, ${purpose}, ${expiresAt})
						ON CONFLICT (user_id, purpose) DO UPDATE
						SET id = EXCLUDED.id, created_at = now(), expires_at = EXCLUDED.expires_at
					`,
				)

				return 'created' as const
			})
		},

		/**
		 * Uses a live verification link and marks its user's email verified. Returns
		 * the user's id, or null when the link is not live.
		 */
		async verifyEmail(id: string) {
			const verified = await db.first<{ id: string }>(
				sql`
					WITH used AS (
						DELETE FROM email_tokens
						WHERE id = ${id} AND purpose = 'verify_email' AND expires_at > now()
						RETURNING user_id
					)
					UPDATE users SET is_verified = true
					WHERE id = (SELECT user_id FROM used)
					RETURNING id
				`,
			)

			return verified?.id ?? null
		},

		/**
		 * Uses a live reset link: sets the password, marks the email verified,
		 * clears the failed logins of the email, and deletes the user's sessions and
		 * other links. Returns the user's id, or null when the link is not live.
		 */
		async resetPassword(id: string, hashedPassword: string) {
			return db.tx(async (tx) => {
				const used = await tx.first<{ user_id: string }>(
					sql`
						DELETE FROM email_tokens
						WHERE id = ${id} AND purpose = 'reset_password' AND expires_at > now()
						RETURNING user_id
					`,
				)

				if (!used) return null

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

				return used.user_id
			})
		},

		async deleteExpiredTokens() {
			return db.exec(sql`DELETE FROM email_tokens WHERE expires_at <= now()`)
		},

		/**
		 * Counts an email to `to` as sent, unless it would pass one of `limits` for
		 * the last day. Returns false, and counts nothing, when it would.
		 */
		async countSentEmail(to: string, verified: boolean, limits: EmailLimits) {
			return db.tx(async (tx) => {
				await lockSentEmails(tx)

				return countSent(tx, to, verified, limits)
			})
		},

		/** Deletes the counts of emails sent more than a day ago. */
		async deleteOldSentEmails() {
			return db.exec(sql`DELETE FROM sent_emails WHERE sent_at <= now() - interval '1 day'`)
		},
	}
}

export type EmailTokenRepository = ReturnType<typeof createEmailTokenRepository>
