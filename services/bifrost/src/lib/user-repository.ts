import { sql } from 'saga'
import type { CredentialsRow, UserRepository, UserRow } from '../auth/types.js'
import { db } from './db.js'

export function createUserRepository(): UserRepository {
	return {
		async insertUser(id, email, hashedPassword) {
			return db.get<UserRow>(
				sql`
					INSERT INTO users (id, email, hashed_password)
					VALUES (${id}, ${email}, ${hashedPassword})
					RETURNING id, email, is_active, is_verified, created_at, updated_at
				`,
			)
		},

		async getCredentialsByEmail(email) {
			return db.query<CredentialsRow>(
				sql`
					SELECT id, hashed_password, is_active
					FROM users
					WHERE email = ${email}
				`,
			)
		},

		async getUserById(id) {
			return db.query<UserRow>(
				sql`
					SELECT id, email, is_active, is_verified, created_at, updated_at
					FROM users
					WHERE id = ${id}
				`,
			)
		},

		async updateUser(id, data) {
			const sets = sql.set(data)

			return db.query<UserRow>(
				sql`
					UPDATE users
					SET ${sets}, updated_at = now()
					WHERE id = ${id}
					RETURNING id, email, is_active, is_verified, created_at, updated_at
				`,
			)
		},

		async deleteUser(id) {
			const count = await db.exec(sql`DELETE FROM users WHERE id = ${id}`)

			return count > 0
		},
	}
}
