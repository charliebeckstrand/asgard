import { HTTPException } from 'grid'

const AUTH_STATUS = {
	passkey_rejected: 400,
	invalid_credentials: 401,
	account_inactive: 403,
	passkey_required: 403,
	sign_in_again: 403,
	passkey_not_found: 404,
	email_exists: 409,
	last_admin_passkey: 409,
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
