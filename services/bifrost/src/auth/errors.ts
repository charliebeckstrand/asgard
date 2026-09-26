import { HTTPException } from 'grid'

const AUTH_STATUS = {
	invalid_credentials: 401,
	account_inactive: 403,
	email_exists: 409,
} as const

export type AuthErrorCode = keyof typeof AUTH_STATUS

export class AuthError extends HTTPException {
	constructor(
		public readonly code: AuthErrorCode,
		message: string,
	) {
		super(AUTH_STATUS[code], { message })
		this.name = 'AuthError'
	}
}
