import { type Db, sql } from 'saga'
import type { User } from 'skuld'

export interface CredentialsRow {
	id: string
	/** Null for an account made with GitHub or Google. */
	hashed_password: string | null
	is_active: boolean
	is_verified: boolean
}

const userColumns = sql`id, email, name, is_active, is_verified, roles, created_at, updated_at`

/** An address's network: itself for IPv4, its /64 for IPv6. */
const network = (ip: string) =>
	sql`network(set_masklen(${ip}::inet, CASE family(${ip}::inet) WHEN 6 THEN 64 ELSE 32 END))`

export function createUserRepository(db: Db) {
	return {
		/** Returns null, and inserts nothing, when a user already has the email. */
		async insertUser(email: string, hashedPassword: string, name: string | null = null) {
			return db.first<User>(
				sql`
					INSERT INTO users (email, hashed_password, name)
					VALUES (${email}, ${hashedPassword}, ${name})
					ON CONFLICT (email) DO NOTHING
					RETURNING ${userColumns}
				`,
			)
		},

		async getCredentialsByEmail(email: string) {
			return db.first<CredentialsRow>(
				sql`
					SELECT id, hashed_password, is_active, is_verified
					FROM users
					WHERE email = ${email}
				`,
			)
		},

		async getUsers() {
			return db.many<User>(sql`SELECT ${userColumns} FROM users ORDER BY created_at`)
		},

		async getUserById(id: string) {
			return db.first<User>(
				sql`
					SELECT ${userColumns}
					FROM users
					WHERE id = ${id}
				`,
			)
		},

		/** Returns null for admins and unknown ids. */
		async setUserActive(id: string, isActive: boolean) {
			return db.first<User>(
				sql`
					UPDATE users
					SET is_active = ${isActive}
					WHERE id = ${id} AND NOT 'admin' = ANY(roles)
					RETURNING ${userColumns}
				`,
			)
		},

		/**
		 * Deletes the user, and with them everything that names them. Returns null
		 * for admins and unknown ids.
		 */
		async deleteUser(id: string) {
			return db.first<User>(
				sql`
					DELETE FROM users
					WHERE id = ${id} AND NOT 'admin' = ANY(roles)
					RETURNING ${userColumns}
				`,
			)
		},

		/**
		 * Counts a login for `email` as failed until its password proves right. Past
		 * `limit`, one try is let through each `waitSeconds`; returns false when this
		 * one must wait.
		 */
		async countFailedLogin(email: string, limit: number, waitSeconds: number) {
			// The row lock orders concurrent tries, so each sees the count of the last.
			const counted = await db.exec(
				sql`
					INSERT INTO failed_logins (email) VALUES (${email})
					ON CONFLICT (email) DO UPDATE
					SET count = failed_logins.count + 1, last_failed_at = now()
					WHERE failed_logins.count < ${limit}
					OR failed_logins.last_failed_at <= now() - make_interval(secs => ${waitSeconds})
				`,
			)

			return counted > 0
		},

		async clearFailedLogins(email: string) {
			await db.exec(sql`DELETE FROM failed_logins WHERE email = ${email}`)
		},

		/** Deletes the counts of emails with no failed login in the last `seconds`. */
		async deleteStaleFailedLogins(seconds: number) {
			return db.exec(
				sql`DELETE FROM failed_logins WHERE last_failed_at <= now() - make_interval(secs => ${seconds})`,
			)
		},

		/**
		 * Counts a sign-up from `ip`'s network, unless it already made `limit` in the
		 * last day. Returns false, and counts nothing, when it has.
		 */
		async countSignUp(ip: string, limit: number) {
			return db.tx(async (tx) => {
				// Lets other sign-ups wait, so two can't both take the last one.
				await tx.exec(sql`LOCK TABLE sign_ups IN EXCLUSIVE MODE`)

				const { count } = await tx.one<{ count: number }>(
					sql`
						SELECT count(*)::int AS count
						FROM sign_ups
						WHERE network = ${network(ip)} AND created_at > now() - interval '1 day'
					`,
				)

				if (count >= limit) return false

				await tx.exec(sql`INSERT INTO sign_ups (network) VALUES (${network(ip)})`)

				return true
			})
		},

		/** Deletes the counts of sign-ups made more than a day ago. */
		async deleteOldSignUps() {
			return db.exec(sql`DELETE FROM sign_ups WHERE created_at <= now() - interval '1 day'`)
		},
	}
}

export type UserRepository = ReturnType<typeof createUserRepository>
