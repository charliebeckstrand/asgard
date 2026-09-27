import { HTTPException } from 'grid'

const AUTH_STATUS = {
	passkey_rejected: 400,
	code_rejected: 400,
	link_expired: 400,
	password_breached: 400,
	turnstile_failed: 400,
	invalid_credentials: 401,
	account_inactive: 403,
	sign_in_again: 403,
	email_unverified: 403,
	second_step_required: 403,
	passkey_not_found: 404,
	totp_not_found: 404,
	identity_not_found: 404,
	oauth_unavailable: 404,
	email_verified: 409,
	sign_in_expired: 410,
	last_admin_factor: 409,
	totp_exists: 409,
	no_second_factor: 409,
	last_sign_in: 409,
	too_many_logins: 429,
	too_many_sign_ups: 429,
	too_many_steps: 429,
	email_recently_sent: 429,
	too_many_emails: 429,
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
