import { sql } from 'saga'
import type { User } from 'skuld'
import type { CredentialsRow, UserRepository } from '../auth/types.js'
import { db } from './db.js'

export function createUserRepository(): UserRepository {
	return {
		async insertUser(email, hashedPassword) {
			return db.one<User>(
				sql`
					INSERT INTO users (email, hashed_password)
					VALUES (${email}, ${hashedPassword})
					RETURNING id, email, is_active, is_verified, role, created_at, updated_at
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
				sql`SELECT id, email, is_active, is_verified, role, created_at, updated_at FROM users ORDER BY created_at`,
			)
		},

		async getUserById(id) {
			return db.first<User>(
				sql`
					SELECT id, email, is_active, is_verified, role, created_at, updated_at
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
					WHERE id = ${id} AND role = 'user'
					RETURNING id, email, is_active, is_verified, role, created_at, updated_at
				`,
			)
		},
	}
}
