import { sql } from 'saga'
import type { User } from 'skuld'
import type { CredentialsRow, UserRepository } from '../auth/types.js'
import { db } from './db.js'

export function createUserRepository(): UserRepository {
	return {
		async insertUser(id, email, hashedPassword) {
			return db.one<User>(
				sql`
					INSERT INTO users (id, email, hashed_password)
					VALUES (${id}, ${email}, ${hashedPassword})
					RETURNING id, email, is_active, is_verified, created_at, updated_at
				`,
			)
		},

		async getCredentialsByEmail(email) {
			return db.first<CredentialsRow>(
				sql`
					SELECT id, hashed_password, is_active
					FROM users
					WHERE email = ${email}
				`,
			)
		},

		async getUsers() {
			return db.many<User>(
				sql`SELECT id, email, is_active, is_verified, created_at, updated_at FROM users ORDER BY created_at`,
			)
		},

		async getUserById(id) {
			return db.first<User>(
				sql`
					SELECT id, email, is_active, is_verified, created_at, updated_at
					FROM users
					WHERE id = ${id}
				`,
			)
		},

		async updateUser(id, data) {
			const sets = sql.set(data)

			return db.first<User>(
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
