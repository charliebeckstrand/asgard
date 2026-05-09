import type { User } from 'skuld'

export interface CredentialsRow {
	id: string
	hashed_password: string
	is_active: boolean
}

export interface UserRepository {
	insertUser(id: string, email: string, hashedPassword: string): Promise<User>
	getCredentialsByEmail(email: string): Promise<CredentialsRow | null>
	getUsers(): Promise<User[]>
	getUserById(id: string): Promise<User | null>
	updateUser(id: string, data: { email?: string; is_active?: boolean }): Promise<User | null>
	deleteUser(id: string): Promise<boolean>
}
