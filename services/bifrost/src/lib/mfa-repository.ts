import { type Db, type Queryable, type SqlFragment, sql } from 'saga'

/** The second factors of a user. Recovery codes only count while another factor is on. */
export interface Factors {
	passkeys: number
	totp: boolean
	recovery_codes: number
}

export interface StoredTotp {
	secret: Uint8Array
	last_step: number
	confirmed: boolean
}

/** Passkeys plus a confirmed authenticator app. */
export function countSecondFactors(q: Queryable, userId: string): Promise<number> {
	return q.val<number>(
		sql`
			SELECT
				(SELECT count(*) FROM passkeys WHERE user_id = ${userId})::int
				+ (SELECT count(*) FROM totp_secrets WHERE user_id = ${userId} AND confirmed_at IS NOT NULL)::int
		`,
	)
}

/**
 * Runs `remove` when `owned` finds the factor, unless the user is an admin and it
 * is their last second factor. Recovery codes go with the last factor, since
 * two-step sign-in is then off.
 */
export async function removeSecondFactor(
	tx: Queryable,
	userId: string,
	owned: SqlFragment,
	remove: SqlFragment,
): Promise<'deleted' | 'not_found' | 'last_admin_factor'> {
	// Serializes removals for one user, so two can't both remove "not the last" factor.
	const user = await tx.first<{ roles: string[] }>(
		sql`SELECT roles FROM users WHERE id = ${userId} FOR UPDATE`,
	)

	if (!(await tx.first(owned))) return 'not_found'

	const count = await countSecondFactors(tx, userId)

	if (user?.roles.includes('admin') && count <= 1) return 'last_admin_factor'

	await tx.exec(remove)

	if (count <= 1) {
		await tx.exec(sql`DELETE FROM recovery_codes WHERE user_id = ${userId}`)
	}

	return 'deleted'
}

export function createMfaRepository(db: Db) {
	return {
		async getFactors(userId: string) {
			return db.one<Factors>(
				sql`
					SELECT
						(SELECT count(*) FROM passkeys WHERE user_id = ${userId})::int AS passkeys,
						EXISTS (
							SELECT 1 FROM totp_secrets WHERE user_id = ${userId} AND confirmed_at IS NOT NULL
						) AS totp,
						(SELECT count(*) FROM recovery_codes WHERE user_id = ${userId})::int AS recovery_codes
				`,
			)
		},

		async getTotp(userId: string): Promise<StoredTotp | null> {
			const row = await db.first<{ secret: Buffer; last_step: string; confirmed: boolean }>(
				sql`
					SELECT secret, last_step, confirmed_at IS NOT NULL AS confirmed
					FROM totp_secrets
					WHERE user_id = ${userId}
				`,
			)

			if (!row) return null

			// BIGINT arrives as a string.
			return {
				secret: new Uint8Array(row.secret),
				last_step: Number(row.last_step),
				confirmed: row.confirmed,
			} satisfies StoredTotp
		},

		/** The most recently added secret of any user, or null when no one has one. */
		async getLatestSecret() {
			const row = await db.first<{ secret: Buffer }>(
				sql`SELECT secret FROM totp_secrets ORDER BY created_at DESC LIMIT 1`,
			)

			return row ? new Uint8Array(row.secret) : null
		},

		/** Stores an unconfirmed secret, replacing an earlier unconfirmed one. Refuses when one is confirmed. */
		async setPendingTotp(userId: string, secret: Uint8Array) {
			const written = await db.exec(
				sql`
					INSERT INTO totp_secrets (user_id, secret)
					VALUES (${userId}, ${Buffer.from(secret)})
					ON CONFLICT (user_id) DO UPDATE
					SET secret = EXCLUDED.secret, last_step = 0, created_at = now()
					WHERE totp_secrets.confirmed_at IS NULL
				`,
			)

			return written > 0 ? ('created' as const) : ('exists' as const)
		},

		/** Confirms the pending secret and records `step` as used. */
		async confirmTotp(userId: string, step: number) {
			const updated = await db.exec(
				sql`
					UPDATE totp_secrets
					SET confirmed_at = now(), last_step = ${step}
					WHERE user_id = ${userId} AND confirmed_at IS NULL
				`,
			)

			return updated > 0
		},

		/** Records `step` as used, unless it or a later one already was. */
		async useTotpStep(userId: string, step: number) {
			const updated = await db.exec(
				sql`
					UPDATE totp_secrets
					SET last_step = ${step}
					WHERE user_id = ${userId} AND confirmed_at IS NOT NULL AND last_step < ${step}
				`,
			)

			return updated > 0
		},

		/** Refuses to delete the last second factor of an admin. */
		async deleteTotp(userId: string) {
			const where = sql`WHERE user_id = ${userId} AND confirmed_at IS NOT NULL`

			return db.tx((tx) =>
				removeSecondFactor(
					tx,
					userId,
					sql`SELECT 1 FROM totp_secrets ${where}`,
					sql`DELETE FROM totp_secrets ${where}`,
				),
			)
		},

		async replaceRecoveryCodes(userId: string, hashes: string[]) {
			await db.tx(async (tx) => {
				await tx.exec(sql`DELETE FROM recovery_codes WHERE user_id = ${userId}`)

				await tx.exec(
					sql`
						INSERT INTO recovery_codes (user_id, code_hash)
						SELECT ${userId}, unnest(${hashes}::text[])
					`,
				)
			})
		},

		async useRecoveryCode(userId: string, hash: string) {
			const deleted = await db.exec(
				sql`DELETE FROM recovery_codes WHERE user_id = ${userId} AND code_hash = ${hash}`,
			)

			return deleted > 0
		},

		/**
		 * Counts a second step of `userId` as failed until it passes, across all their
		 * sessions. Past `limit`, one try is let through each `waitSeconds`; returns
		 * false when this one must wait.
		 */
		async countFailedStep(userId: string, limit: number, waitSeconds: number) {
			// The row lock orders concurrent tries, so each sees the count of the last.
			const counted = await db.exec(
				sql`
					INSERT INTO failed_steps (user_id) VALUES (${userId})
					ON CONFLICT (user_id) DO UPDATE
					SET count = failed_steps.count + 1, last_failed_at = now()
					WHERE failed_steps.count < ${limit}
					OR failed_steps.last_failed_at <= now() - make_interval(secs => ${waitSeconds})
				`,
			)

			return counted > 0
		},

		async clearFailedSteps(userId: string) {
			await db.exec(sql`DELETE FROM failed_steps WHERE user_id = ${userId}`)
		},

		/** Deletes the counts of users with no failed second step in the last `seconds`. */
		async deleteStaleFailedSteps(seconds: number) {
			return db.exec(
				sql`DELETE FROM failed_steps WHERE last_failed_at <= now() - make_interval(secs => ${seconds})`,
			)
		},
	}
}

export type MfaRepository = ReturnType<typeof createMfaRepository>
