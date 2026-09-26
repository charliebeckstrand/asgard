import { sql } from 'saga'
import type { Passkey } from 'skuld'
import type { PasskeyRepository, StoredPasskey } from '../auth/types.js'
import { db } from './db.js'

interface PasskeyRow extends Omit<StoredPasskey, 'counter'> {
	// BIGINT arrives as a string.
	counter: string
}

const selectPasskey = sql`SELECT id, user_id, public_key, counter, transports, created_at FROM passkeys`

function toStoredPasskey(row: PasskeyRow): StoredPasskey {
	return { ...row, public_key: new Uint8Array(row.public_key), counter: Number(row.counter) }
}

export function createPasskeyRepository(): PasskeyRepository {
	return {
		async insertPasskey(userId, { id, publicKey, counter, transports }) {
			return db.one<Passkey>(
				sql`
					INSERT INTO passkeys (id, user_id, public_key, counter, transports)
					VALUES (${id}, ${userId}, ${Buffer.from(publicKey)}, ${counter}, ${transports})
					RETURNING id, created_at
				`,
			)
		},

		async findPasskey(id) {
			const row = await db.first<PasskeyRow>(sql`${selectPasskey} WHERE id = ${id}`)

			return row ? toStoredPasskey(row) : null
		},

		async getPasskeys(userId) {
			const rows = await db.many<PasskeyRow>(
				sql`${selectPasskey} WHERE user_id = ${userId} ORDER BY created_at`,
			)

			return rows.map(toStoredPasskey)
		},

		async setCounter(id, counter) {
			await db.exec(sql`UPDATE passkeys SET counter = ${counter} WHERE id = ${id}`)
		},

		async deletePasskey(id, userId) {
			return db.tx(async (tx) => {
				// Serializes deletes for one user, so two can't both remove "not the last" passkey.
				const user = await tx.first<{ role: string }>(
					sql`SELECT role FROM users WHERE id = ${userId} FOR UPDATE`,
				)

				const owned = await tx.first(
					sql`SELECT 1 FROM passkeys WHERE id = ${id} AND user_id = ${userId}`,
				)

				if (!owned) return 'not_found'

				if (user?.role === 'admin') {
					const count = await tx.val<number>(
						sql`SELECT count(*)::int FROM passkeys WHERE user_id = ${userId}`,
					)

					if (count <= 1) return 'last_admin_passkey'
				}

				await tx.exec(sql`DELETE FROM passkeys WHERE id = ${id}`)

				return 'deleted'
			})
		},

		async createChallenge(id, userId, expiresAt) {
			await db.exec(
				sql`INSERT INTO challenges (id, user_id, expires_at) VALUES (${id}, ${userId}, ${expiresAt})`,
			)
		},

		async useChallenge(id, userId) {
			const owner = userId === null ? sql`user_id IS NULL` : sql`user_id = ${userId}`

			const deleted = await db.exec(
				sql`DELETE FROM challenges WHERE id = ${id} AND ${owner} AND expires_at > now()`,
			)

			return deleted > 0
		},

		async deleteExpiredChallenges() {
			return db.exec(sql`DELETE FROM challenges WHERE expires_at <= now()`)
		},
	}
}
