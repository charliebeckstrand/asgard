import { sql } from 'mimir'
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

export async function createUser(
	id: string,
	email: string,
	hashedPassword: string,
): Promise<UserRow> {
	const pool = getConfig().getPool()

	const { rows } = await pool.query<UserRow>(
		sql`INSERT INTO users (id, email, hashed_password)
		 VALUES (${id}, ${email}, ${hashedPassword})
		 RETURNING id, email, is_active, is_verified, created_at, updated_at`,
	)

	return rows[0]
}

export async function findCredentialsByEmail(email: string): Promise<CredentialsRow | null> {
	const pool = getConfig().getPool()

	const { rows } = await pool.query<CredentialsRow>(
		sql`SELECT id, hashed_password, is_active FROM users WHERE email = ${email}`,
	)

	return rows[0] ?? null
}

export async function findUserById(id: string): Promise<UserRow | null> {
	const pool = getConfig().getPool()

	const { rows } = await pool.query<UserRow>(
		sql`SELECT id, email, is_active, is_verified, created_at, updated_at FROM users WHERE id = ${id}`,
	)

	return rows[0] ?? null
}

export async function deactivateUser(id: string): Promise<void> {
	const pool = getConfig().getPool()

	await pool.query(sql`UPDATE users SET is_active = false WHERE id = ${id}`)
}
