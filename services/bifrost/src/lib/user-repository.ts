import { type Db, sql } from 'saga'
import type { User } from 'skuld'
import type { CredentialsRow, UserRepository } from '../auth/types.js'

/** An address's network: itself for IPv4, its /64 for IPv6. */
const network = (ip: string) =>
	sql`network(set_masklen(${ip}::inet, CASE family(${ip}::inet) WHEN 6 THEN 64 ELSE 32 END))`

export function createUserRepository(db: Db): UserRepository {
	return {
		async insertUser(email, hashedPassword) {
			return db.one<User>(
				sql`
					INSERT INTO users (email, hashed_password)
					VALUES (${email}, ${hashedPassword})
					RETURNING id, email, is_active, is_verified, roles, created_at, updated_at
				`,
			)
		},

		async getCredentialsByEmail(email) {
			return db.first<CredentialsRow>(
				sql`
					SELECT id, hashed_password, is_active, is_verified
					FROM users
					WHERE email = ${email}
				`,
			)
		},

		async getUsers() {
			return db.many<User>(
				sql`SELECT id, email, is_active, is_verified, roles, created_at, updated_at FROM users ORDER BY created_at`,
			)
		},

		async getUserById(id) {
			return db.first<User>(
				sql`
					SELECT id, email, is_active, is_verified, roles, created_at, updated_at
					FROM users
					WHERE id = ${id}
				`,
			)
		},

		async setUserActive(id, isActive) {
			return db.first<User>(
				sql`
					UPDATE users
					SET is_active = ${isActive}
					WHERE id = ${id} AND NOT 'admin' = ANY(roles)
					RETURNING id, email, is_active, is_verified, roles, created_at, updated_at
				`,
			)
		},

		async deleteUser(id) {
			return db.first<User>(
				sql`
					DELETE FROM users
					WHERE id = ${id} AND NOT 'admin' = ANY(roles)
					RETURNING id, email, is_active, is_verified, roles, created_at, updated_at
				`,
			)
		},

		async countFailedLogin(email, limit, waitSeconds) {
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

		async clearFailedLogins(email) {
			await db.exec(sql`DELETE FROM failed_logins WHERE email = ${email}`)
		},

		async deleteStaleFailedLogins(seconds) {
			return db.exec(
				sql`DELETE FROM failed_logins WHERE last_failed_at <= now() - make_interval(secs => ${seconds})`,
			)
		},

		async countSignUp(ip, limit) {
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

		async deleteOldSignUps() {
			return db.exec(sql`DELETE FROM sign_ups WHERE created_at <= now() - interval '1 day'`)
		},
	}
}
