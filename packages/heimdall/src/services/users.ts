import { createDb, sql } from 'mimir'
import { getConfig } from '../config.js'

export interface UserRow {
	id: string
	email: string
	is_active: boolean
	is_verified: boolean
	created_at: string
	updated_at: string
}

export interface CredentialsRow {
	id: string
	hashed_password: string
	is_active: boolean
}

function getDb() {
	return createDb(getConfig().getPool())
}

export async function createUser(
	id: string,
	email: string,
	hashedPassword: string,
): Promise<UserRow> {
	const db = getDb()

	return db.first<UserRow>(
		sql`INSERT INTO users (id, email, hashed_password)
		 VALUES (${id}, ${email}, ${hashedPassword})
		 RETURNING id, email, is_active, is_verified, created_at, updated_at`,
	)
}

export async function findCredentialsByEmail(email: string): Promise<CredentialsRow | null> {
	const db = getDb()

	return db.one<CredentialsRow>(
		sql`SELECT id, hashed_password, is_active FROM users WHERE email = ${email}`,
	)
}

export async function findUserById(id: string): Promise<UserRow | null> {
	const db = getDb()

	return db.one<UserRow>(
		sql`SELECT id, email, is_active, is_verified, created_at, updated_at FROM users WHERE id = ${id}`,
	)
}

export async function deactivateUser(id: string): Promise<void> {
	const db = getDb()

	await db.exec(sql`UPDATE users SET is_active = false WHERE id = ${id}`)
}
