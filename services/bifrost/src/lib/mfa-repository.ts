import { type Queryable, type SqlFragment, sql } from 'saga'
import type { Factors, MfaRepository, StoredTotp } from '../auth/types.js'
import { db } from './db.js'

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
	const user = await tx.first<{ role: string }>(
		sql`SELECT role FROM users WHERE id = ${userId} FOR UPDATE`,
	)

	if (!(await tx.first(owned))) return 'not_found'

	const count = await countSecondFactors(tx, userId)

	if (user?.role === 'admin' && count <= 1) return 'last_admin_factor'

	await tx.exec(remove)

	if (count <= 1) {
		await tx.exec(sql`DELETE FROM recovery_codes WHERE user_id = ${userId}`)
	}

	return 'deleted'
}

export function createMfaRepository(): MfaRepository {
	return {
		async getFactors(userId) {
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

		async getTotp(userId) {
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

		async setPendingTotp(userId, secret) {
			const written = await db.exec(
				sql`
					INSERT INTO totp_secrets (user_id, secret)
					VALUES (${userId}, ${Buffer.from(secret)})
					ON CONFLICT (user_id) DO UPDATE
					SET secret = EXCLUDED.secret, last_step = 0, created_at = now()
					WHERE totp_secrets.confirmed_at IS NULL
				`,
			)

			return written > 0 ? 'created' : 'exists'
		},

		async confirmTotp(userId, step) {
			const updated = await db.exec(
				sql`
					UPDATE totp_secrets
					SET confirmed_at = now(), last_step = ${step}
					WHERE user_id = ${userId} AND confirmed_at IS NULL
				`,
			)

			return updated > 0
		},

		async useTotpStep(userId, step) {
			const updated = await db.exec(
				sql`
					UPDATE totp_secrets
					SET last_step = ${step}
					WHERE user_id = ${userId} AND confirmed_at IS NOT NULL AND last_step < ${step}
				`,
			)

			return updated > 0
		},

		async deleteTotp(userId) {
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

		async replaceRecoveryCodes(userId, hashes) {
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

		async useRecoveryCode(userId, hash) {
			const deleted = await db.exec(
				sql`DELETE FROM recovery_codes WHERE user_id = ${userId} AND code_hash = ${hash}`,
			)

			return deleted > 0
		},

		async createTicket(id, userId, expiresAt) {
			await db.exec(
				sql`INSERT INTO login_tickets (id, user_id, expires_at) VALUES (${id}, ${userId}, ${expiresAt})`,
			)
		},

		async useTicketAttempt(id, maxAttempts) {
			const row = await db.first<{ user_id: string }>(
				sql`
					UPDATE login_tickets
					SET attempts = attempts + 1
					WHERE id = ${id} AND attempts < ${maxAttempts} AND expires_at > now()
					RETURNING user_id
				`,
			)

			return row?.user_id ?? null
		},

		async findTicket(id, maxAttempts) {
			return db.val<string | null>(
				sql`
					SELECT (
						SELECT user_id FROM login_tickets
						WHERE id = ${id} AND attempts < ${maxAttempts} AND expires_at > now()
					)
				`,
			)
		},

		async deleteTicket(id) {
			await db.exec(sql`DELETE FROM login_tickets WHERE id = ${id}`)
		},

		async deleteExpiredTickets() {
			return db.exec(sql`DELETE FROM login_tickets WHERE expires_at <= now()`)
		},
	}
}
