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

export interface UserRepository {
	insertUser(id: string, email: string, hashedPassword: string): Promise<UserRow>
	getCredentialsByEmail(email: string): Promise<CredentialsRow | null>
	getUserById(id: string): Promise<UserRow | null>
}
