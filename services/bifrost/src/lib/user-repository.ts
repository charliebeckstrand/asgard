import { type Db, sql } from 'saga'
import type { User } from 'skuld'
import type { CredentialsRow, UserRepository } from '../auth/types.js'

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
	}
}
