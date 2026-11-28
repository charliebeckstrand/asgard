import { type Db, sql } from 'saga'
import type { Passkey } from 'skuld'

/** A passkey with what a ceremony needs: its public key, signature counter and transports. */
export interface StoredPasskey {
	id: string
	user_id: string
	public_key: Uint8Array<ArrayBuffer>
	counter: number
	transports: string[]
	created_at: string
}

import { removeSecondFactor } from './mfa-repository.js'

interface PasskeyRow extends Omit<StoredPasskey, 'counter'> {
	// BIGINT arrives as a string.
	counter: string
}

const selectPasskey = sql`SELECT id, user_id, public_key, counter, transports, created_at FROM passkeys`

function toStoredPasskey(row: PasskeyRow): StoredPasskey {
	return { ...row, public_key: new Uint8Array(row.public_key), counter: Number(row.counter) }
}

export function createPasskeyRepository(db: Db) {
	return {
		async insertPasskey(
			userId: string,
			{
				id,
				publicKey,
				counter,
				transports,
			}: { id: string; publicKey: Uint8Array; counter: number; transports: string[] },
		) {
			return db.one<Passkey>(
				sql`
					INSERT INTO passkeys (id, user_id, public_key, counter, transports)
					VALUES (${id}, ${userId}, ${Buffer.from(publicKey)}, ${counter}, ${transports})
					RETURNING id, created_at
				`,
			)
		},

		async findPasskey(id: string) {
			const row = await db.first<PasskeyRow>(sql`${selectPasskey} WHERE id = ${id}`)

			return row ? toStoredPasskey(row) : null
		},

		async getPasskeys(userId: string) {
			const rows = await db.many<PasskeyRow>(
				sql`${selectPasskey} WHERE user_id = ${userId} ORDER BY created_at`,
			)

			return rows.map(toStoredPasskey)
		},

		async setCounter(id: string, counter: number) {
			await db.exec(sql`UPDATE passkeys SET counter = ${counter} WHERE id = ${id}`)
		},

		/** Refuses to delete the last second factor of an admin. */
		async deletePasskey(id: string, userId: string) {
			return db.tx((tx) =>
				removeSecondFactor(
					tx,
					userId,
					sql`SELECT 1 FROM passkeys WHERE id = ${id} AND user_id = ${userId}`,
					sql`DELETE FROM passkeys WHERE id = ${id}`,
				),
			)
		},

		/** `userId` binds the challenge to adding a passkey; null means signing in. */
		async createChallenge(id: string, userId: string | null, expiresAt: Date) {
			await db.exec(
				sql`INSERT INTO challenges (id, user_id, expires_at) VALUES (${id}, ${userId}, ${expiresAt})`,
			)
		},

		/** Deletes the live challenge for `userId` and reports whether there was one. */
		async useChallenge(id: string, userId: string | null) {
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

export type PasskeyRepository = ReturnType<typeof createPasskeyRepository>
