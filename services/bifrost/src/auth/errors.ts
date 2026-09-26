import { HTTPException } from 'grid'

const AUTH_STATUS = {
	passkey_rejected: 400,
	code_rejected: 400,
	invalid_credentials: 401,
	account_inactive: 403,
	sign_in_again: 403,
	passkey_not_found: 404,
	totp_not_found: 404,
	identity_not_found: 404,
	oauth_unavailable: 404,
	email_exists: 409,
	sign_in_expired: 410,
	last_admin_factor: 409,
	totp_exists: 409,
	no_second_factor: 409,
	last_sign_in: 409,
	mfa_unavailable: 503,
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
